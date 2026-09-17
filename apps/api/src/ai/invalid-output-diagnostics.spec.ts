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

describe('unparseable output shape', () => {
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

  afterEach(() => {
    delete process.env.PROVIDER_DEBUG_INVALID_OUTPUT;
    jest.restoreAllMocks();
  });

  function entry(): Record<string, unknown> | undefined {
    return warnings.mock.calls
      .map(([value]) => value as Record<string, unknown>)
      .find((value) => value?.event === 'provider_invalid_output');
  }

  function respondText(text: string) {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'resp_test',
          object: 'response',
          status: 'completed',
          output: [message(text)],
        }),
        { headers: { 'Content-Type': 'application/json' } },
      ),
    );
  }

  it('separates output cut off mid-value from output that merely will not parse', async () => {
    respondText('{"summary":"half a resp');
    await expect(
      provider.generateStructured(generationRequest),
    ).rejects.toMatchObject({ code: 'INVALID_OUTPUT' });
    expect(entry()).toMatchObject({
      reason: 'unparseable_json',
      endsWithBrace: false,
    });

    warnings.mockClear();
    // Complete-looking but badly escaped: a raw quote inside a string value.
    respondText('{"summary":"he said "hi" to me","tags":[]}');
    await expect(
      provider.generateStructured(generationRequest),
    ).rejects.toMatchObject({ code: 'INVALID_OUTPUT' });
    expect(entry()).toMatchObject({
      reason: 'unparseable_json',
      endsWithBrace: true,
    });
  });

  it('withholds the text itself unless debugging is explicitly enabled', async () => {
    respondText('{"summary":"secret-value-here');
    await expect(
      provider.generateStructured(generationRequest),
    ).rejects.toMatchObject({ code: 'INVALID_OUTPUT' });
    expect(JSON.stringify(entry())).not.toContain('secret-value-here');
    expect(entry()).not.toHaveProperty('sample');
  });

  it('includes a capped sample when an operator opts in', async () => {
    process.env.PROVIDER_DEBUG_INVALID_OUTPUT = '1';
    respondText(`{"summary":"${'x'.repeat(900)}`);
    await expect(
      provider.generateStructured(generationRequest),
    ).rejects.toMatchObject({ code: 'INVALID_OUTPUT' });
    expect(String(entry()?.sample)).toHaveLength(400);
  });
});

describe('duplicated output parts', () => {
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

  function respondWithParts(texts: string[]) {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'resp_test',
          object: 'response',
          status: 'completed',
          output: [
            {
              type: 'message',
              id: 'msg_test',
              role: 'assistant',
              status: 'completed',
              content: texts.map((text) => ({
                type: 'output_text',
                text,
                annotations: [],
              })),
            },
          ],
        }),
        { headers: { 'Content-Type': 'application/json' } },
      ),
    );
  }

  const valid = '{"summary":"Example","tags":[]}';

  it('uses the first part instead of the concatenation', async () => {
    // Observed live: the model emitted one decision twice. Each half parses; joined
    // they do not, and it surfaced as unparseable JSON with no hint of the cause.
    respondWithParts([valid, valid]);

    await expect(
      provider.generateStructured(generationRequest),
    ).resolves.toEqual({ summary: 'Example', tags: [] });
  });

  it('records that parts were discarded rather than doing it silently', async () => {
    respondWithParts([valid, valid, valid]);
    await provider.generateStructured(generationRequest);

    const entry = warnings.mock.calls
      .map(([value]) => value as Record<string, unknown>)
      .find((value) => value?.event === 'provider_extra_output_parts');
    expect(entry).toMatchObject({ parts: 3, usedFirst: true });
    // Still no payload in the log.
    expect(JSON.stringify(entry)).not.toContain('Example');
  });

  it('is quiet when there is only one part', async () => {
    respondWithParts([valid]);
    await provider.generateStructured(generationRequest);
    expect(
      warnings.mock.calls
        .map(([value]) => value as Record<string, unknown>)
        .some((value) => value?.event === 'provider_extra_output_parts'),
    ).toBe(false);
  });

  it('reports the part count when the first part is itself unparseable', async () => {
    respondWithParts(['not json at all', valid]);
    await expect(
      provider.generateStructured(generationRequest),
    ).rejects.toMatchObject({ code: 'INVALID_OUTPUT' });

    const entry = warnings.mock.calls
      .map(([value]) => value as Record<string, unknown>)
      .find((value) => value?.event === 'provider_invalid_output');
    expect(entry).toMatchObject({
      reason: 'unparseable_json',
      outputParts: 2,
    });
  });
});
