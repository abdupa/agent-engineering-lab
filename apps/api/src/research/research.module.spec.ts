import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { MODEL_PROVIDER } from '../ai/model-provider';
import { OpenAIModelProvider } from '../ai/openai-model-provider';
import { ResearchModule } from './research.module';

function compile(config: Record<string, unknown>) {
  return Test.createTestingModule({ imports: [ResearchModule] })
    .overrideProvider(ConfigService)
    .useValue({ get: (key: string) => config[key] })
    .compile();
}

describe('research provider composition', () => {
  it.each([undefined, '', '  ', 42])(
    'rejects invalid API key configuration: %j',
    async (apiKey) => {
      await expect(
        compile({ OPENAI_API_KEY: apiKey, OPENAI_MODEL: 'test-model' }),
      ).rejects.toThrow('OPENAI_API_KEY must be a non-empty string');
    },
  );

  it.each([undefined, '', '  ', 42])(
    'rejects invalid model configuration: %j',
    async (model) => {
      await expect(
        compile({ OPENAI_API_KEY: 'test-only-key', OPENAI_MODEL: model }),
      ).rejects.toThrow('OPENAI_MODEL must be a non-empty string');
    },
  );

  it('constructs the configured concrete provider without making a request', async () => {
    const module = await compile({
      OPENAI_API_KEY: 'test-only-key',
      OPENAI_MODEL: 'test-model',
    });
    try {
      expect(module.get(MODEL_PROVIDER)).toBeInstanceOf(OpenAIModelProvider);
    } finally {
      await module.close();
    }
  });
});
