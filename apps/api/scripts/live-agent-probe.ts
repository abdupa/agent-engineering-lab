import 'reflect-metadata';
import { ConsoleLogger, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AgentDecisionService } from '../src/agent/agent-decision.service';
import { MODEL_PROVIDER } from '../src/ai/model-provider';
import type { ModelProvider } from '../src/ai/model-provider';
import { ModelProviderError } from '../src/ai/model-provider.error';
import { AuditService } from '../src/audit/audit.service';
import { Workspace } from '../src/audit/workspace';
import { requestContext } from '../src/observability/request-context';
import {
  costRatesFromEnv,
  describeUsage,
  withUsage,
} from '../src/observability/usage';

/**
 * Manual entry point only. Never imported by application startup or Jest.
 *
 * Two stages, cheapest risk first. Stage one asks whether the live Structured Outputs
 * API accepts AgentDecisionTransportSchema at all. Stage two runs a short audit against
 * a throwaway fixture.
 *
 * At most 1 + MAX_ITERATIONS billable requests. Measured on the first live run: roughly
 * 500-600 input tokens per step at this size, a few seconds each. Stage two never
 * touches AUDIT_ROOT — it builds its own temporary directory, so a probe cannot wander
 * into a real codebase.
 */

/**
 * A useful audit needs at minimum list -> read -> report -> finish, so a cap of two
 * could never produce a finding. The first probe run proved that the hard way: the
 * agent investigated correctly and hit the limit before it could report anything.
 *
 * Override with PROBE_MAX_ITERATIONS to trade spend against completeness.
 */
const MAX_ITERATIONS = (() => {
  const raw = Number(process.env.PROBE_MAX_ITERATIONS ?? '8');
  return Number.isInteger(raw) && raw >= 1 && raw <= 20 ? raw : 8;
})();

function fail(reason: string, code = 'CONFIGURATION'): void {
  console.error(JSON.stringify({ event: 'agent_probe_blocked', code, reason }));
  process.exitCode = 1;
}

async function main(): Promise<void> {
  try {
    if (existsSync('.env')) process.loadEnvFile('.env');
  } catch {
    return fail('Cannot load API .env file');
  }

  const missing = ['OPENAI_API_KEY', 'OPENAI_MODEL', 'AUDIT_ROOT'].filter(
    (name) => !process.env[name]?.trim(),
  );
  if (missing.length) {
    console.error(JSON.stringify({ event: 'agent_probe_blocked', missing }));
    process.exitCode = 1;
    return;
  }

  const model = process.env.OPENAI_MODEL!.trim();
  if (!/^[a-zA-Z0-9._:/-]{1,128}$/.test(model) || model.startsWith('sk-')) {
    return fail('OPENAI_MODEL must be a safe model identifier');
  }
  if (
    process.env.OPENAI_BASE_URL &&
    process.env.OPENAI_BASE_URL.replace(/\/$/, '') !==
      'https://api.openai.com/v1'
  ) {
    return fail('OPENAI_BASE_URL must target the official OpenAI API');
  }

  const { AppModule } = await import('../src/app.module');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
    abortOnError: false,
  });
  Logger.overrideLogger(new ConsoleLogger({ json: true }));
  const logger = new Logger('LiveAgentProbe');
  const provider = app.get<ModelProvider>(MODEL_PROVIDER);
  const decisions = new AgentDecisionService(provider);
  const rates = costRatesFromEnv(process.env);
  let sandbox: string | undefined;

  try {
    // ---- Stage 1: does the live API accept the agent decision schema? ----
    const stageOneId = randomUUID();
    const { result: decision, usage: stageOneUsage } = await withUsage(() =>
      requestContext.run({ requestId: stageOneId }, () =>
        decisions.decide(
          {
            goal: 'Reply by finishing immediately with the single word: ready.',
            observations: [],
          },
          [
            {
              name: 'noop',
              description: 'Does nothing. Do not call this tool.',
            },
          ],
        ),
      ),
    );
    logger.log({
      event: 'agent_probe_stage_1',
      requestId: stageOneId,
      model,
      schema: 'AgentDecisionTransportSchema',
      accepted: true,
      decisionType: decision.type,
      ...stageOneUsage,
    });
    console.log(`  stage 1: ${describeUsage(stageOneUsage, rates)}`);

    // ---- Stage 2: a two-step audit over a throwaway fixture ----
    sandbox = await mkdtemp(join(tmpdir(), 'agent-probe-'));
    await writeFile(
      join(sandbox, 'parse.ts'),
      [
        '// Handles input arriving from an untrusted HTTP request body.',
        'export function parsePayload(raw: string) {',
        '  return JSON.parse(raw);',
        '}',
        '',
      ].join('\n'),
    );
    await writeFile(
      join(sandbox, 'README.md'),
      '# Probe fixture\n\nparsePayload validates all input before parsing it.\n',
    );

    const workspace = await Workspace.create(sandbox);
    const audit = new AuditService(decisions, {
      maxIterations: MAX_ITERATIONS,
      timeoutMs: 90_000,
    });

    const stageTwoId = randomUUID();
    const {
      result: { report, failure },
      usage: stageTwoUsage,
    } = await withUsage(() =>
      requestContext.run({ requestId: stageTwoId }, () =>
        audit.audit(
          workspace,
          'Unvalidated handling of untrusted input, and documentation that contradicts the code.',
        ),
      ),
    );

    logger.log({
      event: 'agent_probe_stage_2',
      requestId: stageTwoId,
      model,
      maxIterations: MAX_ITERATIONS,
      toolCalls: report.toolCalls,
      findings: report.findings.length,
      outcome: failure ? 'incomplete' : 'complete',
      ...(failure ? { code: failure.code } : {}),
      ...stageTwoUsage,
    });

    // The fixture is throwaway and its two files are printed above in source, so the
    // findings can be shown. Never do this for a real audited codebase.
    console.log(
      JSON.stringify(
        {
          event: 'agent_probe_report',
          summary: report.summary,
          findings: report.findings,
        },
        null,
        2,
      ),
    );
    console.log(
      [
        '',
        'Check by hand before trusting any of it:',
        '  1. Does each cited line actually say what "evidence" claims?',
        '  2. Did it read the files, or report without reading?',
        '  3. Did it notice the README contradicts parse.ts?',
        '',
        `Steps allowed: ${MAX_ITERATIONS}. Raise with PROBE_MAX_ITERATIONS if it ran out.`,
        '',
        `Stage 2: ${describeUsage(stageTwoUsage, rates)}`,
        `Combined: ${describeUsage(
          {
            calls: stageOneUsage.calls + stageTwoUsage.calls,
            inputTokens: stageOneUsage.inputTokens + stageTwoUsage.inputTokens,
            outputTokens:
              stageOneUsage.outputTokens + stageTwoUsage.outputTokens,
            totalTokens: stageOneUsage.totalTokens + stageTwoUsage.totalTokens,
          },
          rates,
        )}`,
        '',
      ].join('\n'),
    );
  } finally {
    if (sandbox) await rm(sandbox, { recursive: true, force: true });
    await app.close();
  }
}

void main().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      event: 'agent_probe_failed',
      // Raw provider detail is discarded here as it is everywhere else.
      code: error instanceof ModelProviderError ? error.code : 'INTERNAL',
      stage: 'see the last agent_probe_stage_* event above',
    }),
  );
  process.exitCode = 1;
});
