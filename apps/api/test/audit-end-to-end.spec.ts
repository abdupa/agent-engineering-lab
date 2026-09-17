import { Logger } from '@nestjs/common';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import OpenAI from 'openai';
import { AgentDecisionService } from '../src/agent/agent-decision.service';
import { OpenAIModelProvider } from '../src/ai/openai-model-provider';
import { observeOpenAIFetch } from '../src/ai/openai-observability';
import { AuditService } from '../src/audit/audit.service';
import { Workspace } from '../src/audit/workspace';

/**
 * The highest-fidelity offline test available: real workspace, real tools, real registry
 * and executor, real agent loop, real decision service, and the real OpenAIModelProvider
 * driven by a fake `fetch`.
 *
 * Every other fake in this repository hands the system a pre-built object, which skips
 * the whole text -> JSON.parse -> schema path. All four defects that cost live runs lived
 * in exactly that gap:
 *
 *   1. zodTextFormat refusing a schema containing a transform  (caught before the network)
 *   2. a synchronous parse of a schema carrying an async refinement
 *   3. a schema refinement failing the decision instead of the tool call
 *   4. output_text concatenating two identical parts into invalid JSON
 *
 * Each is reproduced here. The point is not that these four never recur; it is that a
 * defect of this kind should fail in a test run rather than in a paid one.
 */

interface Decision {
  decision:
    | { toolName: 'finish'; result: string }
    | { toolName: string; arguments: unknown };
}

/** A Responses API payload shaped the way the SDK expects to receive one. */
function responseBody(texts: string[], status = 'completed') {
  return JSON.stringify({
    id: 'resp_test',
    object: 'response',
    status,
    usage: { input_tokens: 100, output_tokens: 20, total_tokens: 120 },
    output: [
      {
        type: 'message',
        id: 'msg_test',
        role: 'assistant',
        status: 'completed',
        content: texts.map((text) => ({
          type: 'output_text',
          text,
          annotations: [],
        })),
      },
    ],
  });
}

/**
 * Replays decisions as real HTTP bodies. `repeatParts` duplicates the serialized text
 * into a second content part, reproducing the failure observed on run 10.
 */
type FetchCall = [unknown, RequestInit | undefined];

function scriptedFetch(script: Decision[], repeatParts = new Set<number>()) {
  let index = 0;
  const mock = jest.fn((_url: unknown, _options?: RequestInit) => {
    const step = index++;
    const decision = script[Math.min(step, script.length - 1)];
    const text = JSON.stringify(decision);
    const parts = repeatParts.has(step) ? [text, text] : [text];
    return Promise.resolve(
      new Response(responseBody(parts), {
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });
  return {
    mock,
    get steps() {
      return index;
    },
  };
}

function buildAudit(fetchMock: (...args: never[]) => Promise<Response>) {
  const provider = new OpenAIModelProvider(
    new OpenAI({
      apiKey: 'test-only-key',
      fetch: observeOpenAIFetch(fetchMock as unknown as typeof fetch),
      logLevel: 'off',
    }),
    'configured-model',
  );
  return new AuditService(new AgentDecisionService(provider), {
    maxIterations: 12,
    timeoutMs: 60_000,
  });
}

let sandbox: string;
let workspace: Workspace;

beforeAll(async () => {
  sandbox = await mkdtemp(join(tmpdir(), 'audit-e2e-'));
  await mkdir(join(sandbox, 'src'), { recursive: true });
  await writeFile(
    join(sandbox, 'src', 'handler.ts'),
    [
      '// Handles input arriving from an untrusted HTTP request body.',
      'export function handle(raw: string) {',
      '  return JSON.parse(raw);',
      '}',
      '',
    ].join('\n'),
  );
  await writeFile(join(sandbox, 'README.md'), '# Fixture\n');
  workspace = await Workspace.create(sandbox);
});

afterAll(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

beforeEach(() => {
  jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

/** The trajectory a working audit produces, serialized exactly as the model would. */
const completeTrajectory: Decision[] = [
  { decision: { toolName: 'list-files', arguments: {} } },
  {
    decision: {
      toolName: 'read-file',
      arguments: { path: 'src/handler.ts', maxBytes: 4000 },
    },
  },
  {
    decision: {
      toolName: 'report-finding',
      arguments: {
        path: 'src/handler.ts',
        line: 3,
        endLine: null,
        severity: 'high',
        claim: 'Untrusted input is parsed without validation',
      },
    },
  },
  { decision: { toolName: 'finish', result: 'Examined one source file.' } },
];

describe('a complete audit, end to end, with no pre-built objects anywhere', () => {
  it('runs the whole trajectory and records a finding read from the file', async () => {
    const { mock } = scriptedFetch(completeTrajectory);
    const { report, failure } = await buildAudit(mock).audit(workspace);

    expect(failure).toBeUndefined();
    expect(report.summary).toBe('Examined one source file.');
    expect(report.toolCalls).toBe(3);
    expect(report.findings).toEqual([
      {
        path: 'src/handler.ts',
        line: 3,
        severity: 'high',
        claim: 'Untrusted input is parsed without validation',
        // Read from the file by the tool, never sent by the model.
        evidence: '  return JSON.parse(raw);',
      },
    ]);
  });

  it('sends a schema the provider could actually convert', async () => {
    // zodTextFormat runs inside the provider. A tool schema it cannot represent fails
    // here as CONFIGURATION before any request — which is exactly what run 9 hit.
    const { mock } = scriptedFetch(completeTrajectory);
    await buildAudit(mock).audit(workspace);

    const calls = mock.mock.calls as unknown as FetchCall[];
    const options = calls[0]?.[1];
    if (!options) throw new Error('expected a request to have been issued');
    const body = JSON.parse(String(options.body)) as {
      text: { format: { schema: unknown; strict: boolean } };
    };
    expect(body.text.format.strict).toBe(true);
    expect(JSON.stringify(body.text.format.schema)).toContain('report-finding');
  });
});

describe('the provider pathologies that cost live runs', () => {
  it('recovers when the model emits the same decision twice (run 10)', async () => {
    // Duplicated on the report-finding step, the worst place for it.
    const { mock } = scriptedFetch(completeTrajectory, new Set([2]));
    const { report, failure } = await buildAudit(mock).audit(workspace);

    expect(failure).toBeUndefined();
    expect(report.findings).toHaveLength(1);
  });

  it('recovers when every step duplicates', async () => {
    const { mock } = scriptedFetch(completeTrajectory, new Set([0, 1, 2, 3]));
    const { report, failure } = await buildAudit(mock).audit(workspace);
    expect(failure).toBeUndefined();
    expect(report.findings).toHaveLength(1);
  });

  it('turns an invented path into a recoverable observation, not a dead run (run 7)', async () => {
    // A schema refinement here would fail the DECISION and end the audit. It has to
    // reach the executor so the agent gets an observation and can correct.
    const { mock } = scriptedFetch([
      {
        decision: {
          toolName: 'report-finding',
          arguments: {
            path: 'src/imaginary.ts',
            line: 1,
            endLine: null,
            severity: 'high',
            claim: 'Invented file',
          },
        },
      },
      completeTrajectory[2] as Decision,
      completeTrajectory[3] as Decision,
    ]);

    const { report, failure } = await buildAudit(mock).audit(workspace);

    expect(failure).toBeUndefined();
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]?.path).toBe('src/handler.ts');
  });

  it('handles an empty path as the workspace root (run 7)', async () => {
    const { mock } = scriptedFetch([
      { decision: { toolName: 'list-files', arguments: { path: '' } } },
      completeTrajectory[3] as Decision,
    ]);
    const { report, failure } = await buildAudit(mock).audit(workspace);
    expect(failure).toBeUndefined();
    expect(report.toolCalls).toBe(1);
  });

  it('reports a genuinely malformed body as a decision failure', async () => {
    // Not everything should be recovered from. Garbage is still garbage.
    const mock = jest.fn((_url: unknown, _options?: RequestInit) =>
      Promise.resolve(
        new Response(responseBody(['{"decision":{"toolName":']), {
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    const { failure } = await buildAudit(mock).audit(workspace);
    expect(failure?.code).toBe('DECISION_FAILED');
  });
});
