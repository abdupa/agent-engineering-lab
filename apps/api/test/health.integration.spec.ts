import { INestApplication, Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mkdtemp, rm } from 'node:fs/promises';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Workspace } from '../src/audit/workspace';
import request from 'supertest';
import OpenAI from 'openai';
import { OpenAIModelProvider } from '../src/ai/openai-model-provider';
import { observeOpenAIFetch } from '../src/ai/openai-observability';
import { httpObservability } from '../src/observability/http-observability';
import { requestContext } from '../src/observability/request-context';
import { ModelProviderError } from '../src/ai/model-provider.error';
import type { ModelProviderErrorCode } from '../src/ai/model-provider.error';
import { AppModule } from '../src/app.module';
import { AUDIT_WORKSPACE } from '../src/audit/audit.tokens';
import { MODEL_PROVIDER } from '../src/ai/model-provider';
import type {
  ModelProvider,
  StructuredGenerationRequest,
} from '../src/ai/model-provider';
import { ResearchPlanSchema } from '../src/research/research-plan.schema';

const plan = ResearchPlanSchema.parse({
  objective: 'Compare database options',
  researchQuestions: [
    {
      id: 'q1',
      question: 'What are the tradeoffs?',
      rationale: 'Guide selection',
    },
  ],
  assumptions: [],
  requiredEvidence: [
    { topic: 'Operations', reason: 'Assess maintenance effort' },
  ],
  unknowns: [],
});

class FakeModelProvider implements ModelProvider {
  requests: StructuredGenerationRequest<unknown>[] = [];
  error?: Error;
  delegate?: ModelProvider;
  requestIds: (string | undefined)[] = [];

  generateStructured<T>(
    generation: StructuredGenerationRequest<T>,
  ): Promise<T> {
    this.requests.push(generation);
    this.requestIds.push(requestContext.getStore()?.requestId);
    if (this.delegate) return this.delegate.generateStructured(generation);
    if (this.error) return Promise.reject(this.error);
    return Promise.resolve(generation.schema.parse(plan));
  }
}

describe('API HTTP integration', () => {
  let app: INestApplication<Server>;
  let auditSandbox: string;
  let logWarning: jest.SpyInstance;
  let logs: jest.SpyInstance;
  const provider = new FakeModelProvider();

  beforeAll(async () => {
    auditSandbox = await mkdtemp(join(tmpdir(), 'health-audit-root-'));
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MODEL_PROVIDER)
      .useValue(provider)
      // AppModule now mounts AuditModule, whose workspace is resolved at startup.
      .overrideProvider(AUDIT_WORKSPACE)
      .useValue(await Workspace.create(auditSandbox))
      .compile();
    app = module.createNestApplication<INestApplication<Server>>();
    app.use(httpObservability);
    await app.listen(0, '127.0.0.1');
  });

  beforeEach(() => {
    logs = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    logWarning = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    provider.requests = [];
    provider.requestIds = [];
    provider.error = undefined;
    provider.delegate = undefined;
  });

  afterEach(() => jest.restoreAllMocks());

  afterAll(async () => {
    await app?.close();
    if (auditSandbox) await rm(auditSandbox, { recursive: true, force: true });
  });

  it('GET /health returns the health contract without calling the provider', async () => {
    await request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect('Content-Type', /json/)
      .expect({ status: 'ok' });
    expect(provider.requests).toHaveLength(0);
  });

  it('POST /research/plan exercises the controller, service, and provider contract', async () => {
    await request(app.getHttpServer())
      .post('/research/plan')
      .send({ objective: plan.objective })
      .expect(200)
      .expect(plan);
    expect(provider.requests).toHaveLength(1);
    const generation = provider.requests[0]!;
    expect(JSON.parse(generation.input)).toEqual({ objective: plan.objective });
    expect(generation.schema).toBe(ResearchPlanSchema);
    expect(generation.instructions).toMatch(/research plan, not an answer/i);
  });

  it.each([{ constraints: [] }, { constraints: [' Keep operations simple '] }])(
    'accepts optional constraints: $constraints',
    async ({ constraints }) => {
      await request(app.getHttpServer())
        .post('/research/plan')
        .send({
          objective: ' Compare database options ',
          constraints,
          extra: 'ignored',
        })
        .expect(200)
        .expect(plan);
      expect(JSON.parse(provider.requests[0]!.input)).toEqual({
        objective: plan.objective,
        constraints: constraints.map((value) => value.trim()),
      });
    },
  );

  it.each([
    { name: 'missing objective', body: {} },
    { name: 'empty objective', body: { objective: '' } },
    { name: 'blank objective', body: { objective: ' \n\t' } },
    { name: 'numeric objective', body: { objective: 42 } },
    { name: 'null objective', body: { objective: null } },
    {
      name: 'string constraints',
      body: { objective: 'test', constraints: 'none' },
    },
    {
      name: 'object constraints',
      body: { objective: 'test', constraints: {} },
    },
    {
      name: 'null constraints',
      body: { objective: 'test', constraints: null },
    },
    {
      name: 'numeric constraint',
      body: { objective: 'test', constraints: [42] },
    },
    {
      name: 'null constraint',
      body: { objective: 'test', constraints: [null] },
    },
    {
      name: 'empty constraint',
      body: { objective: 'test', constraints: [''] },
    },
    {
      name: 'blank constraint',
      body: { objective: 'test', constraints: ['valid', ' \t'] },
    },
    { name: 'array body', body: [] },
  ])('rejects $name before generation', async ({ body }) => {
    await request(app.getHttpServer())
      .post('/research/plan')
      .send(body)
      .expect(400);
    expect(provider.requests).toHaveLength(0);
  });

  it('does not expose upstream error messages or status codes', async () => {
    provider.error = Object.assign(new Error('secret-key-and-private-input'), {
      statusCode: 401,
    });
    await request(app.getHttpServer())
      .post('/research/plan')
      .send({ objective: 'test' })
      .expect(500)
      .expect({ statusCode: 500, message: 'Internal Server Error' });
    expect(provider.requests).toHaveLength(1);
  });
  it.each<{ code: ModelProviderErrorCode; status: number }>([
    { code: 'TIMEOUT', status: 504 },
    { code: 'UNAVAILABLE', status: 503 },
    { code: 'INVALID_OUTPUT', status: 502 },
    { code: 'REFUSED', status: 422 },
    { code: 'CONFIGURATION', status: 500 },
    { code: 'INTERNAL', status: 500 },
  ])(
    'maps $code to HTTP $status without leaking error details',
    async ({ code, status }) => {
      provider.error = new ModelProviderError(code);
      provider.error.message = 'private-key-and-prompt';
      const response = await request(app.getHttpServer())
        .post('/research/plan')
        .send({ objective: 'private-user-input' })
        .expect(status);
      expect(response.text).not.toContain('private');
      if (status !== 500)
        expect(response.body).toMatchObject({ statusCode: status, code });
      expect(logWarning).toHaveBeenCalledWith({
        event: 'research_plan_failed',
        requestId: response.headers['x-request-id'],
        code,
        status,
      });
      expect(logWarning).toHaveBeenCalledTimes(1);
      expect(provider.requests).toHaveLength(1);
    },
  );
  it('generates and returns a request ID and correlates HTTP completion', async () => {
    const response = await request(app.getHttpServer())
      .post('/research/plan')
      .set('Authorization', 'Bearer private-authorization')
      .send({ objective: 'private-objective' })
      .expect(200);
    const requestId: unknown = response.headers['x-request-id'];
    expect(requestId).toEqual(expect.stringMatching(/^[0-9a-f-]{36}$/));
    expect(provider.requestIds).toEqual([requestId]);
    expect(logs).toHaveBeenCalledWith({
      event: 'http_completed',
      requestId,
      method: 'POST',
      route: '/research/plan',
      status: 200,
      durationMs: expect.any(Number) as unknown,
      outcome: 'completed',
    });
    expect(JSON.stringify(logs.mock.calls)).not.toContain('private-');
  });

  it('accepts a UUID request ID and keeps query strings out of logs', async () => {
    const requestId = 'a721bc71-cd83-4c12-8a85-16d373092358';
    await request(app.getHttpServer())
      .get('/health?token=private-query')
      .set('X-Request-ID', requestId)
      .expect('X-Request-ID', requestId)
      .expect(200);
    expect(logs).toHaveBeenCalledWith({
      event: 'http_completed',
      requestId,
      method: 'GET',
      route: '/health',
      status: 200,
      durationMs: expect.any(Number) as unknown,
      outcome: 'completed',
    });
    expect(logs).toHaveBeenCalledTimes(1);
  });

  it.each([
    'private-header',
    'x'.repeat(200),
    'a721bc71-cd83-4c12-8a85-16d373092358,another',
  ])('replaces invalid correlation header %s', async (incoming) => {
    const response = await request(app.getHttpServer())
      .get('/health')
      .set('X-Request-ID', incoming)
      .expect(200);
    expect(response.headers['x-request-id']).not.toBe(incoming);
    expect(response.headers['x-request-id']).toEqual(
      expect.stringMatching(/^[0-9a-f-]{36}$/),
    );
    expect(JSON.stringify(logs.mock.calls)).not.toContain(incoming);
  });

  it('correlates malformed JSON before body parsing', async () => {
    const response = await request(app.getHttpServer())
      .post('/research/plan')
      .set('Content-Type', 'application/json')
      .send('{"private-body":')
      .expect(400);
    expect(response.headers['x-request-id']).toBeDefined();
    expect(logs).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'http_completed',
        requestId: response.headers['x-request-id'],
        status: 400,
      }),
    );
    expect(JSON.stringify(logs.mock.calls)).not.toContain('private-body');
    expect(provider.requests).toHaveLength(0);
  });

  it('does not log unmatched URL contents', async () => {
    await request(app.getHttpServer())
      .get('/private-path?token=private-query')
      .expect(404);
    expect(logs).toHaveBeenCalledWith(
      expect.objectContaining({ route: 'unmatched', status: 404 }),
    );
    expect(JSON.stringify(logs.mock.calls)).not.toContain('private-');
  });
  it('correlates concurrent HTTP requests through the real provider with fake transport', async () => {
    const transport = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockImplementation(async () => {
        await Promise.resolve();
        return new Response(
          JSON.stringify({
            id: 'response-test',
            object: 'response',
            status: 'completed',
            output: [
              {
                type: 'message',
                role: 'assistant',
                content: [
                  {
                    type: 'output_text',
                    text: JSON.stringify(plan),
                    annotations: [],
                  },
                ],
              },
            ],
          }),
          { headers: { 'Content-Type': 'application/json' } },
        );
      });
    provider.delegate = new OpenAIModelProvider(
      new OpenAI({
        apiKey: 'private-api-key',
        fetch: observeOpenAIFetch(transport),
        logLevel: 'off',
      }),
      'test-model',
    );
    const ids = [
      'a721bc71-cd83-4c12-8a85-16d373092358',
      'a721bc71-cd83-4c12-8a85-16d373092359',
    ];
    await Promise.all(
      ids.map((requestId) =>
        request(app.getHttpServer())
          .post('/research/plan')
          .set('X-Request-ID', requestId)
          .set('Authorization', 'Bearer private-auth')
          .send({ objective: 'private-input' })
          .expect(200)
          .expect('X-Request-ID', requestId),
      ),
    );
    for (const requestId of ids) {
      expect(logs).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'http_completed',
          requestId,
          status: 200,
        }),
      );
      expect(logs).toHaveBeenCalledWith({
        event: 'provider_execution',
        inputTokens: expect.any(Number) as unknown,
        outputTokens: expect.any(Number) as unknown,
        requestId,
        provider: 'openai',
        model: 'test-model',
        attempt: 1,
        durationMs: expect.any(Number) as unknown,
        outcome: 'success',
      });
      expect(logs).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'provider_attempt',
          requestId,
          attempt: 1,
        }),
      );
    }
    expect(transport).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(logs.mock.calls)).not.toMatch(
      /private-|researchQuestions|Authorization|Bearer/i,
    );
    expect(requestContext.getStore()).toBeUndefined();
  });
});
