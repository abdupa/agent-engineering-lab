import { INestApplication, Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { z } from 'zod';
import { AppModule } from '../src/app.module';
import { MODEL_PROVIDER } from '../src/ai/model-provider';
import type {
  ModelProvider,
  StructuredGenerationRequest,
} from '../src/ai/model-provider';
import { AUDIT_WORKSPACE } from '../src/audit/audit.tokens';
import { Workspace } from '../src/audit/workspace';
import { httpObservability } from '../src/observability/http-observability';

interface Transport {
  decision:
    | { toolName: 'finish'; result: string }
    | { toolName: string; arguments: unknown };
}

// The typed transport is the default since ADR-017's condition was met, so the scripted
// provider answers in that shape — the tests exercise the real configuration.
const call = (toolName: string, args: unknown): Transport => ({
  decision: { toolName, arguments: args },
});
const finish = (result: string): Transport => ({
  decision: { toolName: 'finish', result },
});

const reportReadme = call('report-finding', {
  path: 'README.md',
  line: 1,
  severity: 'medium',
  claim: 'Readme documents no build step',
});

/** Parsing the body validates the response contract instead of merely casting it. */
const AuditResponseSchema = z.object({
  status: z.enum(['complete', 'incomplete']),
  reason: z.string().optional(),
  summary: z.string(),
  toolCalls: z.number(),
  findings: z.array(z.object({ path: z.string(), claim: z.string() }).loose()),
  usage: z.object({
    calls: z.number(),
    inputTokens: z.number(),
    outputTokens: z.number(),
    totalTokens: z.number(),
  }),
});
const body = (response: { body: unknown }) =>
  AuditResponseSchema.parse(response.body);

/** Replays a script per request; the real decision service still translates it. */
class ScriptedProvider implements ModelProvider {
  script: Transport[] = [];
  private index = 0;
  reset(script: Transport[]) {
    this.script = script;
    this.index = 0;
  }
  generateStructured<T>(req: StructuredGenerationRequest<T>): Promise<T> {
    const next = this.script[this.index++];
    if (!next) throw new Error('Script exhausted');
    return req.schema.parseAsync(next);
  }
}

describe('POST /audit', () => {
  let app: INestApplication<Server>;
  let sandbox: string;
  let workspace: Workspace;
  const provider = new ScriptedProvider();

  beforeAll(async () => {
    sandbox = await mkdtemp(join(tmpdir(), 'audit-http-'));
    await mkdir(join(sandbox, 'src'), { recursive: true });
    await writeFile(join(sandbox, 'README.md'), '# Fixture project\n');
    await writeFile(join(sandbox, 'src', 'index.ts'), 'export const x = 1;\n');
    workspace = await Workspace.create(sandbox);

    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MODEL_PROVIDER)
      .useValue(provider)
      .overrideProvider(AUDIT_WORKSPACE)
      .useValue(workspace)
      .compile();
    app = module.createNestApplication<INestApplication<Server>>();
    app.use(httpObservability);
    await app.listen(0, '127.0.0.1');
  });

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  afterAll(async () => {
    await app.close();
    await rm(sandbox, { recursive: true, force: true });
  });

  it('returns a complete report with findings', async () => {
    provider.reset([
      call('list-files', {}),
      reportReadme,
      finish('Reviewed the readme and one source file.'),
    ]);

    const response = await request(app.getHttpServer())
      .post('/audit')
      .send({})
      .expect(200);

    expect(response.body).toEqual({
      status: 'complete',
      summary: 'Reviewed the readme and one source file.',
      toolCalls: 2,
      // Zero across the board, and correctly so: token counts are read from the
      // OpenAI response inside the adapter, and this test replaces the adapter with a
      // fake. Usage is populated only on real provider calls.
      usage: { calls: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      findings: [
        {
          path: 'README.md',
          line: 1,
          severity: 'medium',
          claim: 'Readme documents no build step',
          // Read from the fixture by the tool, not supplied in the request above.
          evidence: '# Fixture project',
        },
      ],
    });
  });

  it('accepts a rubric and passes it to the run', async () => {
    provider.reset([finish('Checked only what the rubric asked for.')]);
    await request(app.getHttpServer())
      .post('/audit')
      .send({ rubric: 'Only check for hardcoded credentials.' })
      .expect(200);
  });

  it.each([[{ rubric: '' }], [{ rubric: 42 }], [{ rubric: 'x'.repeat(2001) }]])(
    'rejects the invalid body %j with 400',
    async (body) => {
      await request(app.getHttpServer()).post('/audit').send(body).expect(400);
    },
  );

  it('offers no way to point the audit at another directory', async () => {
    provider.reset([finish('Done.')]);
    // Extra transport fields are ignored: the root is configuration, not input.
    const response = await request(app.getHttpServer())
      .post('/audit')
      .send({ path: '/etc', target: '/etc', root: '/etc' })
      .expect(200);
    expect(body(response).status).toBe('complete');
  });

  it('returns partial findings as an incomplete result rather than an error', async () => {
    provider.reset([
      reportReadme,
      // Script exhausts here, so the next decision fails.
    ]);

    const response = await request(app.getHttpServer())
      .post('/audit')
      .send({})
      .expect(200);

    const parsed = body(response);
    expect(parsed.status).toBe('incomplete');
    expect(parsed.reason).toBe('DECISION_FAILED');
    expect(parsed.findings).toHaveLength(1);
    expect(parsed.summary).toContain('did not complete');
  });

  it('maps a failed run that produced nothing to 502', async () => {
    provider.reset([]);

    const response = await request(app.getHttpServer())
      .post('/audit')
      .send({})
      .expect(502);

    expect(response.body).toEqual({
      statusCode: 502,
      code: 'DECISION_FAILED',
      message: 'Audit reasoning failed',
    });
  });

  it('leaks neither the workspace root nor raw errors on failure', async () => {
    provider.reset([]);
    const response = await request(app.getHttpServer())
      .post('/audit')
      .send({})
      .expect(502);
    const body = JSON.stringify(response.body);
    expect(body).not.toContain(workspace.root);
    expect(body).not.toContain('Script exhausted');
    expect(body).not.toContain('stack');
  });

  it('returns a correlation id on both success and failure', async () => {
    provider.reset([finish('Done.')]);
    const ok = await request(app.getHttpServer())
      .post('/audit')
      .send({})
      .expect(200);
    expect(ok.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);

    provider.reset([]);
    const bad = await request(app.getHttpServer())
      .post('/audit')
      .send({})
      .expect(502);
    expect(bad.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('propagates a supplied request id', async () => {
    provider.reset([finish('Done.')]);
    const id = 'a721bc71-cd83-4c12-8a85-16d373092358';
    const response = await request(app.getHttpServer())
      .post('/audit')
      .set('X-Request-ID', id)
      .send({})
      .expect(200);
    expect(response.headers['x-request-id']).toBe(id);
  });

  it('keeps the existing research endpoint working alongside it', async () => {
    // The audit module must not disturb what was already mounted.
    await request(app.getHttpServer())
      .post('/research/plan')
      .send({ objective: '' })
      .expect(400);
  });

  it('keeps health reporting process liveness', async () => {
    await request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect({ status: 'ok' });
  });
});
