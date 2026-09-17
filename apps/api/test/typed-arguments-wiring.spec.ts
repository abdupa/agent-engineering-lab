import { INestApplication, Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { MODEL_PROVIDER } from '../src/ai/model-provider';
import type {
  ModelProvider,
  StructuredGenerationRequest,
} from '../src/ai/model-provider';
import { AUDIT_WORKSPACE } from '../src/audit/audit.tokens';
import { Workspace } from '../src/audit/workspace';

/**
 * AGENT_TYPED_ARGUMENTS passes through validateEnvironment, ConfigService, the module
 * factory and into the decision service. A first attempt at the factory edit silently
 * matched nothing, so the flag was recorded in run records while the old transport kept
 * being used. This asserts the whole path rather than any one link in it.
 */

class RecordingProvider implements ModelProvider {
  instructions: string[] = [];
  generateStructured<T>(request: StructuredGenerationRequest<T>): Promise<T> {
    this.instructions.push(request.instructions);
    // Whatever shape was asked for, answer with a finish so the run terminates.
    return request.schema.parseAsync(
      request.instructions.includes('argumentsJson')
        ? { decision: { type: 'finish', result: 'Done.' } }
        : { decision: { toolName: 'finish', result: 'Done.' } },
    );
  }
}

async function bootWith(flag: string | undefined) {
  const previous = process.env.AGENT_TYPED_ARGUMENTS;
  if (flag === undefined) delete process.env.AGENT_TYPED_ARGUMENTS;
  else process.env.AGENT_TYPED_ARGUMENTS = flag;

  const sandbox = await mkdtemp(join(tmpdir(), 'typed-wiring-'));
  await writeFile(join(sandbox, 'a.ts'), 'export const a = 1;\n');
  const provider = new RecordingProvider();
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MODEL_PROVIDER)
    .useValue(provider)
    .overrideProvider(AUDIT_WORKSPACE)
    .useValue(await Workspace.create(sandbox))
    .compile();
  const app = module.createNestApplication<INestApplication<Server>>();
  await app.init();

  return {
    provider,
    async run() {
      await request(app.getHttpServer()).post('/audit').send({}).expect(200);
    },
    async close() {
      await app.close();
      await rm(sandbox, { recursive: true, force: true });
      if (previous === undefined) delete process.env.AGENT_TYPED_ARGUMENTS;
      else process.env.AGENT_TYPED_ARGUMENTS = previous;
    },
  };
}

describe('AGENT_TYPED_ARGUMENTS reaches the decision service', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it.each([[undefined], ['1'], ['true'], ['']])(
    'asks for a typed object when the flag is %p',
    async (flag) => {
      const harness = await bootWith(flag);
      try {
        await harness.run();
        expect(harness.provider.instructions[0]).not.toContain('argumentsJson');
        expect(harness.provider.instructions[0]).toContain(
          'arguments filled in',
        );
      } finally {
        await harness.close();
      }
    },
  );

  it('returns to the string transport only on an explicit 0', async () => {
    // The opt-out has to be deliberate. Anything else, including a typo, keeps the
    // transport that three live runs showed the string one could not match.
    const harness = await bootWith('0');
    try {
      await harness.run();
      expect(harness.provider.instructions[0]).toContain('argumentsJson');
    } finally {
      await harness.close();
    }
  });
});
