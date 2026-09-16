import 'reflect-metadata';
import { ConsoleLogger, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { AgentDecisionService } from '../src/agent/agent-decision.service';
import { AuditService } from '../src/audit/audit.service';
import { AUDIT_WORKSPACE } from '../src/audit/audit.tokens';
import type { Workspace } from '../src/audit/workspace';
import { ModelProviderError } from '../src/ai/model-provider.error';
import { requestContext } from '../src/observability/request-context';
import {
  costRatesFromEnv,
  describeUsage,
  withUsage,
} from '../src/observability/usage';

/**
 * Manual entry point only. Audits the real directory named by AUDIT_ROOT and writes the
 * result to docs/releases/v0.6/runs/ so it becomes evidence rather than scrollback.
 *
 * Unlike the probe, there is no answer key here. The point is to find out what the agent
 * does against code nothing marked up in advance.
 */

const MAX_ITERATIONS = (() => {
  const raw = Number(process.env.AUDIT_MAX_ITERATIONS ?? '12');
  return Number.isInteger(raw) && raw >= 1 && raw <= 40 ? raw : 12;
})();

const RECORDS = resolve(__dirname, '../../../docs/releases/v0.6/runs');

function fail(reason: string): void {
  console.error(JSON.stringify({ event: 'audit_blocked', reason }));
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
    console.error(JSON.stringify({ event: 'audit_blocked', missing }));
    process.exitCode = 1;
    return;
  }

  const { AppModule } = await import('../src/app.module');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
    abortOnError: false,
  });
  Logger.overrideLogger(new ConsoleLogger({ json: true }));
  const logger = new Logger('LiveAudit');
  const rates = costRatesFromEnv(process.env);

  try {
    const workspace = app.get<Workspace>(AUDIT_WORKSPACE);
    // Built from the container's decision service rather than the container's audit
    // service, so this script can set its own step budget without reaching into
    // anything private.
    const service = new AuditService(app.get(AgentDecisionService), {
      maxIterations: MAX_ITERATIONS,
      timeoutMs: 300_000,
    });

    const runId = randomUUID();
    const startedAt = new Date().toISOString();
    const rubric = process.env.AUDIT_RUBRIC?.trim();

    const {
      result: { report, failure },
      usage,
    } = await withUsage(() =>
      requestContext.run({ requestId: runId }, () =>
        rubric ? service.audit(workspace, rubric) : service.audit(workspace),
      ),
    );

    logger.log({
      event: 'live_audit_finished',
      requestId: runId,
      maxIterations: MAX_ITERATIONS,
      toolCalls: report.toolCalls,
      findings: report.findings.length,
      outcome: failure ? 'incomplete' : 'complete',
      ...(failure ? { code: failure.code } : {}),
      ...usage,
    });

    mkdirSync(RECORDS, { recursive: true });
    const file = join(RECORDS, `${startedAt.replace(/[:.]/g, '-')}.json`);
    await writeFile(
      file,
      JSON.stringify(
        {
          runId,
          startedAt,
          model: process.env.OPENAI_MODEL,
          maxIterations: MAX_ITERATIONS,
          rubric: rubric ?? '(default)',
          outcome: failure ? failure.code : 'complete',
          toolCalls: report.toolCalls,
          usage,
          summary: report.summary,
          findings: report.findings,
        },
        null,
        2,
      ),
    );

    console.log(JSON.stringify({ summary: report.summary }, null, 2));
    console.log(JSON.stringify(report.findings, null, 2));
    console.log(
      [
        '',
        `Saved to ${file}`,
        describeUsage(usage, rates),
        '',
        'There is no answer key for this one. For each finding, open the file at that',
        'line and decide: real defect, or plausible-sounding noise? Both counts matter.',
        'Anything it should have found and did not is a finding of its own.',
        '',
      ].join('\n'),
    );
  } finally {
    await app.close();
  }
}

void main().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      event: 'audit_failed',
      code: error instanceof ModelProviderError ? error.code : 'INTERNAL',
    }),
  );
  process.exitCode = 1;
});
