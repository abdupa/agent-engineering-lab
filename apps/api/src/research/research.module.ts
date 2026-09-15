import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { observeOpenAIFetch } from '../ai/openai-observability';
import { MODEL_PROVIDER } from '../ai/model-provider';
import type { ModelProvider } from '../ai/model-provider';
import { OpenAIModelProvider } from '../ai/openai-model-provider';
import { ResearchController } from './research.controller';
import { ResearchPlanService } from './research-plan.service';

@Module({
  imports: [ConfigModule],
  controllers: [ResearchController],
  providers: [
    ResearchPlanService,
    {
      provide: MODEL_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): ModelProvider => {
        const apiKey = config.get<unknown>('OPENAI_API_KEY');
        const model = config.get<unknown>('OPENAI_MODEL');
        if (typeof apiKey !== 'string' || !apiKey.trim()) {
          throw new Error('OPENAI_API_KEY must be a non-empty string');
        }
        if (typeof model !== 'string' || !model.trim()) {
          throw new Error('OPENAI_MODEL must be a non-empty string');
        }
        return new OpenAIModelProvider(
          new OpenAI({
            apiKey: apiKey.trim(),
            logLevel: 'off',
            fetch: observeOpenAIFetch(globalThis.fetch),
          }),
          model.trim(),
        );
      },
    },
  ],
})
export class ResearchModule {}
