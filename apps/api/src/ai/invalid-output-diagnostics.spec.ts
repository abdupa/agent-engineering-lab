import OpenAI from 'openai';
import { Logger } from '@nestjs/common';
import { z } from 'zod';
import { observeOpenAIFetch } from './openai-observability';
import { OpenAIModelProvider } from './openai-model-provider';
import type { ModelProvider } from './model-provider';

/**
 * A live audit failed with a bare INVALID_OUTPUT after nine successful steps. The code
 * said the output was rejected; nothing said whether it had been truncated, was
 * unparseable, or simply did not match the schema — and those call for different
 * responses. These tests pin the diagnostic that was added in response.
 */

const SummarySchema = z.object({
  summary: z.string().trim().min(1),
  tags: z.array(z.string()),
});

const generationRequest = {
  instructions: 'Summarize the input.',
  input: 'A small example.',
  schema: SummarySchema,
};

function message(text: string) {
  return {
    type: 'message',
    id: 'msg_test',
    role: 'assistant',
    status: 'completed',
    content: [{ type: 'output_text', text, annotations: [] }],
  };
}

describe('why output was rejected', () => {
  let fetchMock: jest.MockedFunction<typeof fetch>;
  let warnings: jest.SpyInstance;
  let provider: ModelProvider;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    warnings = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    fetchMock = jest.fn();
    provider = new OpenAIModelProvider(
      new OpenAI({
        apiKey: 'test-only-key',
        fetch: observeOpenAIFetch(fetchMock),
        logLevel: 'off',
      }),
      'configured-model',
    );
  });

  afterEach(() => jest.restoreAllMocks());

  function reason(): Record<string, unknown> | undefined {
    return warnings.mock.calls
      .map(([value]) => value as Record<string, unknown>)
      .find((value) => value?.event === 'provider_invalid_output');
  }

  function respond(body: Record<string, unknown>) {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ id: 'resp_test', object: 'response', ...body }),
        {
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );
  }

  it('reports a truncated response as not_completed, with the provider reason', async () => {
    respond({
      status: 'incomplete',
      incomplete_details: { reason: 'max_output_tokens' },
      output: [],
    });

    await expect(
      provider.generateStructured(generationRequest),
    ).rejects.toMatchObject({ code: 'INVALID_OUTPUT' });

    expect(reason()).toMatchObject({
      reason: 'not_completed',
      status: 'incomplete',
      incompleteReason: 'max_output_tokens',
    });
  });

  it('reports unparseable text separately from a rejected shape', async () => {
    respond({ status: 'completed', output: [message('this is not json')] });
    await expect(
      provider.generateStructured(generationRequest),
    ).rejects.toMatchObject({ code: 'INVALID_OUTPUT' });
    expect(reason()).toMatchObject({ reason: 'unparseable_json' });

    warnings.mockClear();
    respond({
      status: 'completed',
      output: [message('{"summary":"","tags":[]}')],
    });
    await expect(
      provider.generateStructured(generationRequest),
    ).rejects.toMatchObject({ code: 'INVALID_OUTPUT' });
    expect(reason()).toMatchObject({ reason: 'schema_rejected' });
  });

  it('reports empty output text', async () => {
    respond({ status: 'completed', output: [message('   ')] });
    await expect(
      provider.generateStructured(generationRequest),
    ).rejects.toMatchObject({ code: 'INVALID_OUTPUT' });
    expect(reason()).toMatchObject({ reason: 'empty_output_text' });
  });

  it('never logs the rejected value itself', async () => {
    respond({
      status: 'completed',
      output: [message('{"summary":"leaked-secret-value","tags":"wrong"}')],
    });
    await expect(
      provider.generateStructured(generationRequest),
    ).rejects.toMatchObject({ code: 'INVALID_OUTPUT' });
    expect(JSON.stringify(reason())).not.toContain('leaked-secret-value');
  });

  it('keeps the provider-neutral error code unchanged', async () => {
    // The HTTP contract still maps INVALID_OUTPUT to 502. Only the log grew.
    respond({ status: 'incomplete', output: [] });
    await expect(
      provider.generateStructured(generationRequest),
    ).rejects.toMatchObject({
      code: 'INVALID_OUTPUT',
      message: 'Model provider returned invalid output',
    });
  });
});
