import 'reflect-metadata';
import { ConsoleLogger, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { MODEL_PROVIDER } from '../src/ai/model-provider';
import type { ModelProvider } from '../src/ai/model-provider';
import { ModelProviderError } from '../src/ai/model-provider.error';
import { requestContext } from '../src/observability/request-context';
import { ResearchPlanSchema } from '../src/research/research-plan.schema';

// Manual entry point only. Never imported by application startup or Jest.
async function main(): Promise<void> {
  try {
    // pnpm runs this command from apps/api; shell variables take precedence.
    if (existsSync('.env')) process.loadEnvFile('.env');
  } catch {
    console.error(
      JSON.stringify({
        event: 'live_smoke_failed',
        code: 'CONFIGURATION',
        reason: 'Cannot load API .env file',
      }),
    );
    process.exitCode = 1;
    return;
  }
  const missing = ['OPENAI_API_KEY', 'OPENAI_MODEL'].filter(
    (name) => !process.env[name]?.trim(),
  );
  if (missing.length) {
    console.error(JSON.stringify({ event: 'live_smoke_blocked', missing }));
    process.exitCode = 1;
    return;
  }
  const model = process.env.OPENAI_MODEL!.trim();
  if (!/^[a-zA-Z0-9._:/-]{1,128}$/.test(model) || model.startsWith('sk-')) {
    console.error(
      JSON.stringify({
        event: 'live_smoke_failed',
        code: 'CONFIGURATION',
        reason: 'OPENAI_MODEL must be a safe model identifier',
      }),
    );
    process.exitCode = 1;
    return;
  }
  if (
    process.env.OPENAI_BASE_URL &&
    process.env.OPENAI_BASE_URL.replace(/\/$/, '') !==
      'https://api.openai.com/v1'
  ) {
    console.error(
      JSON.stringify({
        event: 'live_smoke_blocked',
        reason: 'OPENAI_BASE_URL must target the official OpenAI API',
      }),
    );
    process.exitCode = 1;
    return;
  }

  // Use the production configuration and instrumented provider binding, without HTTP.
  const { AppModule } = await import('../src/app.module');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
    abortOnError: false,
  });
  Logger.overrideLogger(new ConsoleLogger({ json: true }));
  const logger = new Logger('LiveOpenAISmoke');
  const requestId = randomUUID();
  try {
    const provider = app.get<ModelProvider>(MODEL_PROVIDER);
    const plan = await requestContext.run({ requestId }, () =>
      provider.generateStructured({
        instructions:
          'Return a minimal schema-valid research plan. Set objective to Smoke check and use empty arrays for all collections. Do not perform research.',
        input: JSON.stringify({ objective: 'Smoke check' }),
        schema: ResearchPlanSchema,
      }),
    );
    // Explicit verification only; never print the returned plan or validation issues.
    if (!ResearchPlanSchema.safeParse(plan).success)
      throw new ModelProviderError('INVALID_OUTPUT');
    logger.log({
      event: 'live_smoke_succeeded',
      requestId,
      provider: 'openai',
      model,
      schema: 'ResearchPlanSchema',
      validated: true,
    });
  } finally {
    await app.close();
  }
}

void main().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      event: 'live_smoke_failed',
      code: error instanceof ModelProviderError ? error.code : 'INTERNAL',
    }),
  );
  process.exitCode = 1;
});
