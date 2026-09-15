import OpenAI from 'openai';
import { providerExecution } from './openai-observability';
import { Logger } from '@nestjs/common';
import { correlationFields } from '../observability/request-context';
import { ModelProviderError } from './model-provider.error';
import { zodTextFormat } from 'openai/helpers/zod';
import type {
  ModelProvider,
  StructuredGenerationRequest,
} from './model-provider';

export class OpenAIModelProvider implements ModelProvider {
  private readonly logger = new Logger(OpenAIModelProvider.name);
  constructor(
    private readonly client: OpenAI,
    private readonly model: string,
  ) {
    if (model.trim().length === 0) {
      throw new Error('OpenAI model must be non-empty');
    }
  }

  async generateStructured<T>(
    request: StructuredGenerationRequest<T>,
  ): Promise<T> {
    const started = performance.now();
    const metadata = {
      ...correlationFields(),
      provider: 'openai',
      model:
        /^[a-zA-Z0-9._:/-]{1,128}$/.test(this.model) &&
        !this.model.startsWith('sk-')
          ? this.model
          : '[invalid-model]',
    };
    const execution = { ...metadata, attempt: 0 };
    let outcome = 'success';
    let code: string | undefined;
    try {
      return await providerExecution.run(execution, () =>
        this.execute(request),
      );
    } catch (error) {
      outcome = 'failure';
      code = error instanceof ModelProviderError ? error.code : 'INTERNAL';
      throw error;
    } finally {
      this.logger.log({
        event: 'provider_execution',
        ...execution,
        durationMs: Math.max(0, performance.now() - started),
        outcome,
        ...(code === undefined ? {} : { code }),
      });
    }
  }

  private async execute<T>(
    request: StructuredGenerationRequest<T>,
  ): Promise<T> {
    let format;
    try {
      format = zodTextFormat(request.schema, 'structured_output');
    } catch {
      throw new ModelProviderError('CONFIGURATION');
    }

    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new ModelProviderError('TIMEOUT'));
        controller.abort();
      }, 30_000);
    });
    try {
      return await Promise.race([
        this.generate(request, format, controller.signal),
        deadline,
      ]);
    } catch (error) {
      if (controller.signal.aborted) throw new ModelProviderError('TIMEOUT');
      if (error instanceof ModelProviderError) throw error;
      if (error instanceof OpenAI.APIConnectionTimeoutError) {
        throw new ModelProviderError('TIMEOUT');
      }
      if (error instanceof OpenAI.APIConnectionError) {
        throw new ModelProviderError('UNAVAILABLE');
      }
      if (error instanceof OpenAI.APIError) {
        const status: unknown = error.status;
        if (typeof status !== 'number')
          throw new ModelProviderError('INTERNAL');
        if (status === 408) throw new ModelProviderError('TIMEOUT');
        if (status === 409 || status === 429 || status >= 500) {
          throw new ModelProviderError('UNAVAILABLE');
        }
        if (status >= 400 && status < 500) {
          throw new ModelProviderError('CONFIGURATION');
        }
      }
      if (error instanceof SyntaxError)
        throw new ModelProviderError('INVALID_OUTPUT');
      throw new ModelProviderError('INTERNAL');
    } finally {
      clearTimeout(timer);
    }
  }

  private async generate<T>(
    request: StructuredGenerationRequest<T>,
    format: ReturnType<typeof zodTextFormat>,
    signal: AbortSignal,
  ): Promise<T> {
    const response = await this.client.responses.create(
      {
        model: this.model,
        instructions: request.instructions,
        input: request.input,
        text: { format },
        store: false,
      },
      { maxRetries: 2, timeout: 10_000, signal },
    );

    if (response.status !== 'completed') {
      throw new ModelProviderError('INVALID_OUTPUT');
    }

    const refused = response.output.some(
      (item) =>
        item.type === 'message' &&
        item.content.some((content) => content.type === 'refusal'),
    );
    if (refused) throw new ModelProviderError('REFUSED');
    if (!response.output_text?.trim())
      throw new ModelProviderError('INVALID_OUTPUT');

    try {
      const data: unknown = JSON.parse(response.output_text);
      return request.schema.parse(data);
    } catch {
      throw new ModelProviderError('INVALID_OUTPUT');
    }
  }
}
