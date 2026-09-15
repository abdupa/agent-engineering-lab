import OpenAI from 'openai';
import { Logger } from '@nestjs/common';
import { observeOpenAIFetch } from './openai-observability';
import { requestContext } from '../observability/request-context';
import { z } from 'zod';
import type { ModelProvider } from './model-provider';
import { ModelProviderError } from './model-provider.error';
import { OpenAIModelProvider } from './openai-model-provider';

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

describe('OpenAIModelProvider', () => {
  let fetchMock: jest.MockedFunction<typeof fetch>;
  let client: OpenAI;
  let logs: jest.SpyInstance;
  let provider: ModelProvider;

  beforeEach(() => {
    // Exercise the real SDK and helper with a fake transport; never call the network.
    jest.useFakeTimers();
    logs = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    fetchMock = jest.fn();
    client = new OpenAI({
      apiKey: 'test-only-key',
      fetch: observeOpenAIFetch(fetchMock),
      logLevel: 'off',
    });
    provider = new OpenAIModelProvider(client, 'configured-model');
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  function respond(output: unknown[], status = 'completed') {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ id: 'resp_test', object: 'response', status, output }),
        { headers: { 'Content-Type': 'application/json' } },
      ),
    );
  }

  it('sends Responses JSON Schema configuration and returns Zod-parsed data', async () => {
    respond([
      { type: 'reasoning', id: 'reasoning_test', summary: [] },
      message('{"summary":"  Example  ","tags":[],"extra":true}'),
    ]);

    await expect(
      provider.generateStructured(generationRequest),
    ).resolves.toEqual({
      summary: 'Example',
      tags: [],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.openai.com/v1/responses');
    expect(options?.method).toBe('POST');
    if (typeof options?.body !== 'string') {
      throw new Error('Expected a serialized JSON request body');
    }
    const body: unknown = JSON.parse(options.body);
    expect(body).toEqual({
      model: 'configured-model',
      instructions: generationRequest.instructions,
      input: generationRequest.input,
      store: false,
      text: {
        format: {
          type: 'json_schema',
          name: 'structured_output',
          strict: true,
          schema: {
            $schema: 'http://json-schema.org/draft-07/schema#',
            type: 'object',
            properties: {
              summary: { type: 'string', minLength: 1 },
              tags: { type: 'array', items: { type: 'string' } },
            },
            required: ['summary', 'tags'],
            additionalProperties: false,
          },
        },
      },
    });
  });

  it.each([
    '{"summary":42,"tags":[]}',
    '{"summary":"   ","tags":[]}',
    '{"summary":"Example"}',
    'null',
  ])('rejects output that fails the supplied schema: %s', async (text) => {
    respond([message(text)]);
    await expect(
      provider.generateStructured(generationRequest),
    ).rejects.toMatchObject({ code: 'INVALID_OUTPUT' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed JSON', async () => {
    respond([message('{invalid')]);
    await expect(
      provider.generateStructured(generationRequest),
    ).rejects.toMatchObject({ code: 'INVALID_OUTPUT' });
  });

  it.each([
    { name: 'missing', output: [] },
    { name: 'empty', output: [message('')] },
    { name: 'whitespace', output: [message('   ')] },
  ])('rejects $name output', async ({ output }) => {
    respond(output);
    await expect(
      provider.generateStructured(generationRequest),
    ).rejects.toMatchObject({ code: 'INVALID_OUTPUT' });
  });

  it('rejects a refusal even when accompanied by valid-looking text', async () => {
    respond([
      {
        ...message(''),
        content: [{ type: 'refusal', refusal: 'Cannot comply.' }],
      },
      message('{"summary":"Example","tags":[]}'),
    ]);
    await expect(
      provider.generateStructured(generationRequest),
    ).rejects.toMatchObject({ code: 'REFUSED' });
  });

  it.each(['incomplete', 'failed', 'cancelled', 'queued', 'in_progress'])(
    'rejects a %s response even with valid-looking text',
    async (status) => {
      respond([message('{"summary":"Example","tags":[]}')], status);
      await expect(
        provider.generateStructured(generationRequest),
      ).rejects.toMatchObject({ code: 'INVALID_OUTPUT' });
    },
  );

  it.each([408, 409, 429, 500, 503])(
    'bounds retries for HTTP %s failures',
    async (status) => {
      fetchMock.mockImplementation(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({ error: { message: 'private-response-and-key' } }),
            { status, headers: { 'Content-Type': 'application/json' } },
          ),
        ),
      );
      const result = provider
        .generateStructured(generationRequest)
        .catch((error: unknown) => error);
      await jest.runAllTimersAsync();
      const error = await result;
      expect(error).toBeInstanceOf(ModelProviderError);
      expect(error).toMatchObject({
        code: status === 408 ? 'TIMEOUT' : 'UNAVAILABLE',
      });
      expect(String(error)).not.toContain('private-response-and-key');
      expect(error).not.toHaveProperty('cause');
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(jest.getTimerCount()).toBe(0);
    },
  );

  it.each([400, 401, 403, 404, 422])(
    'does not retry HTTP %s configuration failures',
    async (status) => {
      fetchMock.mockResolvedValue(
        new Response('{"error":{"message":"private-key"}}', { status }),
      );
      await expect(
        provider.generateStructured(generationRequest),
      ).rejects.toMatchObject({ code: 'CONFIGURATION' });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(jest.getTimerCount()).toBe(0);
    },
  );

  it('recovers after a transient failure', async () => {
    respond([message('{"summary":"Example","tags":[]}')]);
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 503 }));
    const result = provider.generateStructured(generationRequest);
    await jest.runAllTimersAsync();
    await expect(result).resolves.toEqual({ summary: 'Example', tags: [] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('normalizes connection failures after bounded retries', async () => {
    fetchMock.mockRejectedValue(new Error('private-network-details'));
    const result = provider
      .generateStructured(generationRequest)
      .catch((error: unknown) => error);
    await jest.runAllTimersAsync();
    expect(await result).toMatchObject({ code: 'UNAVAILABLE' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('aborts slow attempts and stops at the overall deadline', async () => {
    fetchMock.mockImplementation(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true },
          );
        }),
    );
    const result = provider
      .generateStructured(generationRequest)
      .catch((error: unknown) => error);
    await jest.advanceTimersByTimeAsync(10_000);
    expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    await jest.advanceTimersByTimeAsync(20_000);
    expect(await result).toMatchObject({ code: 'TIMEOUT' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    for (const call of fetchMock.mock.calls)
      expect(call[1]?.signal?.aborted).toBe(true);
    await jest.runAllTimersAsync();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('bounds waiting for response body data after headers arrive', async () => {
    fetchMock.mockImplementation((_url, options) =>
      Promise.resolve(
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              options?.signal?.addEventListener(
                'abort',
                () =>
                  controller.error(new DOMException('Aborted', 'AbortError')),
                { once: true },
              );
            },
          }),
          { headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const result = provider
      .generateStructured(generationRequest)
      .catch((error: unknown) => error);
    await jest.advanceTimersByTimeAsync(30_000);
    expect(await result).toMatchObject({ code: 'TIMEOUT' });
    expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('does not send a new request after the deadline during Retry-After waiting', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        new Response('{}', {
          status: 429,
          headers: { 'retry-after': '60' },
        }),
      ),
    );
    const result = provider
      .generateStructured(generationRequest)
      .catch((error: unknown) => error);
    await jest.advanceTimersByTimeAsync(30_000);
    expect(await result).toMatchObject({ code: 'TIMEOUT' });
    await jest.runAllTimersAsync();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('rejects unsupported schema conversion before making a request', async () => {
    await expect(
      provider.generateStructured({
        ...generationRequest,
        schema: z.object({ date: z.date() }),
      }),
    ).rejects.toMatchObject({ code: 'CONFIGURATION' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requires a non-empty configured model', () => {
    expect(() => new OpenAIModelProvider(client, ' ')).toThrow(
      'OpenAI model must be non-empty',
    );
  });
  it('logs correlated retry attempts and a validated execution summary without payloads', async () => {
    const requestId = 'a721bc71-cd83-4c12-8a85-16d373092358';
    respond([message('{"summary":"private-output","tags":[]}')]);
    fetchMock.mockResolvedValueOnce(
      new Response('{"error":{"message":"private-body"}}', { status: 503 }),
    );
    const result = requestContext.run({ requestId }, () =>
      provider.generateStructured({
        ...generationRequest,
        instructions: 'private-prompt',
        input: 'private-input',
      }),
    );
    await jest.runAllTimersAsync();
    await result;
    expect(logs).toHaveBeenNthCalledWith(1, {
      event: 'provider_attempt',
      requestId,
      provider: 'openai',
      model: 'configured-model',
      attempt: 1,
      durationMs: expect.any(Number) as unknown,
      outcome: 'http_error',
      status: 503,
      code: 'UNAVAILABLE',
    });
    expect(logs).toHaveBeenNthCalledWith(2, {
      event: 'provider_attempt',
      requestId,
      provider: 'openai',
      model: 'configured-model',
      attempt: 2,
      durationMs: expect.any(Number) as unknown,
      outcome: 'response_received',
      status: 200,
    });
    expect(logs).toHaveBeenNthCalledWith(3, {
      event: 'provider_execution',
      requestId,
      provider: 'openai',
      model: 'configured-model',
      attempt: 2,
      durationMs: expect.any(Number) as unknown,
      outcome: 'success',
    });
    expect(logs).toHaveBeenCalledTimes(3);
    expect(JSON.stringify(logs.mock.calls)).not.toMatch(
      /private-|test-only-key|Authorization|Bearer/i,
    );
    expect(requestContext.getStore()).toBeUndefined();
  });

  it('logs normalized validation failure even after HTTP success', async () => {
    respond([message('{"summary":42,"tags":[]}')]);
    await expect(
      provider.generateStructured(generationRequest),
    ).rejects.toMatchObject({ code: 'INVALID_OUTPUT' });
    expect(logs).toHaveBeenLastCalledWith({
      event: 'provider_execution',
      provider: 'openai',
      model: 'configured-model',
      attempt: 1,
      durationMs: expect.any(Number) as unknown,
      outcome: 'failure',
      code: 'INVALID_OUTPUT',
    });
  });

  it('records zero attempts for a schema conversion failure', async () => {
    await expect(
      provider.generateStructured({
        ...generationRequest,
        schema: z.object({ date: z.date() }),
      }),
    ).rejects.toMatchObject({ code: 'CONFIGURATION' });
    expect(logs).toHaveBeenCalledTimes(1);
    expect(logs).toHaveBeenCalledWith({
      event: 'provider_execution',
      provider: 'openai',
      model: 'configured-model',
      attempt: 0,
      durationMs: expect.any(Number) as unknown,
      outcome: 'failure',
      code: 'CONFIGURATION',
    });
  });

  it('isolates concurrent provider executions and their HTTP context', async () => {
    fetchMock.mockImplementation(async () => {
      await Promise.resolve();
      return new Response(
        JSON.stringify({
          object: 'response',
          status: 'completed',
          output: [message('{"summary":"Example","tags":[]}')],
        }),
        {
          headers: { 'Content-Type': 'application/json' },
        },
      );
    });
    await Promise.all(
      ['request-one', 'request-two'].map((requestId) =>
        requestContext.run({ requestId }, () =>
          provider.generateStructured(generationRequest),
        ),
      ),
    );
    for (const requestId of ['request-one', 'request-two']) {
      expect(logs).toHaveBeenCalledWith({
        event: 'provider_execution',
        requestId,
        provider: 'openai',
        model: 'configured-model',
        attempt: 1,
        durationMs: expect.any(Number) as unknown,
        outcome: 'success',
      });
    }
    expect(logs).toHaveBeenCalledTimes(4);
  });
});
