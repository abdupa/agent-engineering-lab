import { Logger } from '@nestjs/common';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ToolRegistry } from '../tools/tool-registry';
import { ToolExecutor } from '../tools/tool-executor';
import { ToolExecutionError } from '../tools/tool-execution.error';
import {
  FindingCollector,
  createReportFindingTool,
  type ReportFindingOutput,
} from './report-finding.tool';
import { Workspace } from './workspace';

/**
 * Reporting a finding, and correcting one.
 *
 * Correction exists because of run 12. Told to check what its citation landed on and
 * re-report with a corrected line, the agent obeyed — the same defect at line 26, then 22,
 * then 21, converging on the right one. The tool could only append, so following the
 * instruction produced one defect reported three times with two wrong citations still
 * attached. The report was worse for the agent having done what it was asked.
 */

const GRANTED = { grantedPermissions: ['audit:report'] };

// Failure cases here log at the executor by design; the assertions are about behaviour.
beforeEach(() => {
  jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

let sandbox: string;
let workspace: Workspace;

beforeAll(async () => {
  sandbox = await mkdtemp(join(tmpdir(), 'report-finding-'));
  await writeFile(
    join(sandbox, 'files.ts'),
    [
      'export async function write(name: string) {', // 1
      '  try {', // 2
      '    await save(name);', // 3
      '    return true;', // 4
      '  } catch {', // 5
      '    return true;', // 6
      '  }', // 7
      '}', // 8
      '',
    ].join('\n'),
  );
  workspace = await Workspace.create(sandbox);
});

afterAll(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

/** A fresh tool and collector per test: findings are per-run state, not shared. */
function build() {
  const collector = new FindingCollector();
  const registry = new ToolRegistry();
  registry.register(createReportFindingTool(workspace, collector));
  return { collector, executor: new ToolExecutor(registry) };
}

function report(
  executor: ToolExecutor,
  args: Record<string, unknown>,
): Promise<ReportFindingOutput> {
  return executor.execute(
    'report-finding',
    {
      path: 'files.ts',
      severity: 'medium',
      claim: 'write() returns true even when the save fails',
      ...args,
    },
    GRANTED,
  ) as Promise<ReportFindingOutput>;
}

describe('recording a finding', () => {
  it('gives it an id the agent can refer back to', async () => {
    const { executor } = build();
    const first = await report(executor, { line: 6 });
    expect(first).toMatchObject({
      recorded: true,
      findingId: 'f1',
      replaced: false,
      totalFindings: 1,
    });
  });

  it('numbers findings in the order they were reported', async () => {
    const { executor, collector } = build();
    await report(executor, { line: 6 });
    await report(executor, { line: 4, claim: 'A different claim entirely' });
    expect(collector.ids()).toEqual(['f1', 'f2']);
  });

  it('echoes the line the citation actually landed on', async () => {
    // The mechanism the whole correction flow depends on: the agent can only notice a
    // wrong citation because the tool tells it what the citation resolved to.
    const { executor } = build();
    const result = await report(executor, { line: 3 });
    expect(result.evidence).toBe('    await save(name);');
  });

  it('treats a null replaces as a new finding', async () => {
    // Under strict Structured Outputs every property is present, so null is what the model
    // sends when it means "nothing here". It must not be read as an id.
    const { executor } = build();
    const result = await report(executor, { line: 6, replaces: null });
    expect(result).toMatchObject({ findingId: 'f1', replaced: false });
  });
});

describe('correcting a finding', () => {
  it('overwrites it instead of adding another', async () => {
    const { executor, collector } = build();
    const first = await report(executor, { line: 3 });
    const corrected = await report(executor, {
      line: 6,
      replaces: first.findingId,
    });

    expect(corrected).toMatchObject({
      findingId: 'f1',
      replaced: true,
      totalFindings: 1,
    });
    expect(collector.all()).toHaveLength(1);
    expect(collector.all()[0]).toMatchObject({
      line: 6,
      evidence: '    return true;',
    });
  });

  it('keeps the corrected finding in its original position', async () => {
    // A correction is the same finding said better. Moving it to the end would reorder a
    // report for a reason that has nothing to do with the code being audited.
    const { executor, collector } = build();
    const first = await report(executor, { line: 3 });
    await report(executor, { line: 4, claim: 'An unrelated second finding' });
    await report(executor, { line: 6, replaces: first.findingId });

    expect(collector.ids()).toEqual(['f1', 'f2']);
    expect(collector.all().map((finding) => finding.line)).toEqual([6, 4]);
  });

  it('can be corrected more than once', async () => {
    // Run 12's exact shape: line 26, then 22, then 21. Three calls, one finding.
    const { executor, collector } = build();
    const first = await report(executor, { line: 1 });
    await report(executor, { line: 3, replaces: first.findingId });
    const last = await report(executor, { line: 6, replaces: first.findingId });

    expect(last).toMatchObject({ findingId: 'f1', totalFindings: 1 });
    expect(collector.all()).toHaveLength(1);
    expect(collector.all()[0]?.line).toBe(6);
  });

  it('reproduces run 12 as one finding rather than three', async () => {
    const { executor, collector } = build();
    const opened = await report(executor, { line: 1 });
    expect(opened.evidence).toBe('export async function write(name: string) {');

    const second = await report(executor, {
      line: 5,
      replaces: opened.findingId,
    });
    expect(second.evidence).toBe('  } catch {');

    const third = await report(executor, {
      line: 6,
      replaces: opened.findingId,
    });
    expect(third.evidence).toBe('    return true;');

    // Before this change the same three calls left three findings, two of them citing
    // lines the claim was not about.
    expect(collector.all()).toEqual([
      {
        path: 'files.ts',
        line: 6,
        severity: 'medium',
        claim: 'write() returns true even when the save fails',
        evidence: '    return true;',
      },
    ]);
  });
});

describe('a correction that names nothing', () => {
  it('fails the call rather than quietly appending', async () => {
    /**
     * Falling back to adding a finding the agent asked to replace is exactly the defect
     * being fixed. A failure becomes an observation the agent can act on.
     */
    const { executor, collector } = build();
    await report(executor, { line: 6 });
    await expect(
      report(executor, { line: 4, replaces: 'f99' }),
    ).rejects.toBeInstanceOf(ToolExecutionError);
    expect(collector.all()).toHaveLength(1);
  });

  it('fails when there are no findings at all yet', async () => {
    const { executor, collector } = build();
    await expect(
      report(executor, { line: 6, replaces: 'f1' }),
    ).rejects.toBeInstanceOf(ToolExecutionError);
    expect(collector.all()).toHaveLength(0);
  });

  it('leaves the run able to continue', async () => {
    // The point of failing as a tool error rather than a decision error: the next call
    // still works, so a wrong id costs one step instead of the whole run.
    const { executor, collector } = build();
    await expect(
      report(executor, { line: 6, replaces: 'nonsense' }),
    ).rejects.toBeInstanceOf(ToolExecutionError);
    const after = await report(executor, { line: 6 });
    expect(after).toMatchObject({ findingId: 'f1', totalFindings: 1 });
    expect(collector.all()).toHaveLength(1);
  });
});

describe('the collector on its own', () => {
  it('refuses to replace an id it never issued', () => {
    const collector = new FindingCollector();
    expect(() =>
      collector.replace('f1', {
        path: 'a.ts',
        severity: 'low',
        claim: 'nothing',
      }),
    ).toThrow('No finding with id f1');
  });

  it('hands out copies, so a caller cannot edit the record', () => {
    const collector = new FindingCollector();
    collector.add({ path: 'a.ts', severity: 'low', claim: 'original' });
    const taken = collector.all();
    (taken[0] as { claim: string }).claim = 'tampered';
    expect(collector.all()[0]?.claim).toBe('original');
  });
});
