import OpenAI from 'openai';
import { providerExecution } from './openai-observability';
import { Logger } from '@nestjs/common';
import { correlationFields } from '../observability/request-context';
import { recordUsage } from '../observability/usage';
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
    // Kept out of the AsyncLocalStorage store on purpose: observeOpenAIFetch spreads
    // that store into every attempt log, where a running token total would mislead.
    const tally = { inputTokens: 0, outputTokens: 0 };
    let outcome = 'success';
    let code: string | undefined;
    try {
      return await providerExecution.run(execution, () =>
        this.execute(request, tally),
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
        // Summed across SDK retries: the true cost of this one generation.
        inputTokens: tally.inputTokens,
        outputTokens: tally.outputTokens,
        ...(code === undefined ? {} : { code }),
      });
    }
  }

  private async execute<T>(
    request: StructuredGenerationRequest<T>,
    tally: { inputTokens: number; outputTokens: number },
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
        this.generate(request, format, controller.signal, tally),
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
    tally: { inputTokens: number; outputTokens: number },
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

    // Counted before any outcome check: a refusal or an unparseable response is billed
    // exactly like a useful one, and accounting that only counted successes would
    // under-report what was actually spent.
    recordUsage(response.usage?.input_tokens, response.usage?.output_tokens);
    tally.inputTokens += response.usage?.input_tokens ?? 0;
    tally.outputTokens += response.usage?.output_tokens ?? 0;

    if (response.status !== 'completed') {
      // A truncated response and a malformed one both surfaced as a bare
      // INVALID_OUTPUT, which told an operator nothing about which had happened or
      // whether a larger budget would help. The code stays the same; the reason is now
      // recorded. Status and incomplete reason are provider metadata, not payload.
      throw this.invalidOutput('not_completed', {
        status: response.status,
        incompleteReason: response.incomplete_details?.reason,
      });
    }

    const refused = response.output.some(
      (item) =>
        item.type === 'message' &&
        item.content.some((content) => content.type === 'refusal'),
    );
    if (refused) throw new ModelProviderError('REFUSED');
    if (!response.output_text?.trim())
      throw this.invalidOutput('empty_output_text');

    let data: unknown;
    try {
      data = JSON.parse(response.output_text);
    } catch {
      // Shape metrics, not content. Whether the text ends in a closing brace separates
      // "cut off mid-value" from "complete but badly escaped", which need different
      // fixes and were previously indistinguishable.
      const text = response.output_text;
      throw this.invalidOutput('unparseable_json', {
        outputTextLength: text.length,
        endsWithBrace: text.trimEnd().endsWith('}'),
        quoteCount: (text.match(/"/g) ?? []).length,
        backslashCount: (text.match(/\\/g) ?? []).length,
        // Opt-in only. Model output can contain anything, so this stays off unless an
        // operator deliberately turns it on for a local debugging session.
        ...(process.env.PROVIDER_DEBUG_INVALID_OUTPUT === '1'
          ? { sample: text.slice(0, 400) }
          : {}),
      });
    }
    try {
      return request.schema.parse(data);
    } catch {
      // The value itself is never logged: it is model output and may carry anything.
      throw this.invalidOutput('schema_rejected');
    }
  }

  /** Records why output was rejected, then raises the unchanged provider-neutral error. */
  private invalidOutput(
    reason: string,
    detail: Record<string, unknown> = {},
  ): ModelProviderError {
    try {
      this.logger.warn({
        event: 'provider_invalid_output',
        ...correlationFields(),
        provider: 'openai',
        reason,
        ...detail,
      });
    } catch {
      // Diagnostics must not replace the failure they describe.
    }
    return new ModelProviderError('INVALID_OUTPUT');
  }
}
