import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { AgentDecisionService } from '../agent/agent-decision.service';
import { MODEL_PROVIDER } from '../ai/model-provider';
import type { ModelProvider } from '../ai/model-provider';
import { OpenAIModelProvider } from '../ai/openai-model-provider';
import { observeOpenAIFetch } from '../ai/openai-observability';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';
import { AUDIT_WORKSPACE } from './audit.tokens';
import { Workspace } from './workspace';

@Module({
  imports: [ConfigModule],
  controllers: [AuditController],
  providers: [
    {
      // Resolved once at startup, so a missing or non-existent root fails before the
      // application listens rather than on the first request.
      provide: AUDIT_WORKSPACE,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Promise<Workspace> => {
        const root = config.get<unknown>('AUDIT_ROOT');
        if (typeof root !== 'string' || !root.trim()) {
          throw new Error('AUDIT_ROOT must be a non-empty absolute path');
        }
        return Workspace.create(root.trim());
      },
    },
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
    {
      provide: AgentDecisionService,
      inject: [MODEL_PROVIDER, ConfigService],
      useFactory: (provider: ModelProvider, config: ConfigService) =>
        // Off unless asked for. The string transport is what v0.1-v0.5 shipped against,
        // and the live API's acceptance of the typed shape is confirmed by a probe
        // rather than assumed here. See ADR-017.
        new AgentDecisionService(provider, {
          typedArguments: config.get<string>('AGENT_TYPED_ARGUMENTS') === '1',
        }),
    },
    {
      provide: AuditService,
      inject: [AgentDecisionService],
      useFactory: (decisions: AgentDecisionService) =>
        new AuditService(decisions),
    },
  ],
})
export class AuditModule {}
