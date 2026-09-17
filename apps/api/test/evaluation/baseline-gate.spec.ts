import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadRunRecords } from '../../src/evaluation/run-record.loader';
import { loadRunLabel } from '../../src/evaluation/run-label.loader';
import { scoreLabeledRun } from '../../src/evaluation/metrics';
import {
  compareToBaseline,
  describeDifferences,
  toBaselineEntry,
  type Baseline,
  type BaselineEntry,
} from '../../src/evaluation/baseline';

/**
 * The gate.
 *
 * The stored records never change and the labels are reviewed like fixtures, so a score is
 * a pure function of those two and the scoring code. Any difference from the committed
 * baseline therefore means the code changed, and this test is where that becomes visible
 * instead of shipping quietly.
 *
 * An improvement fails too, on purpose. Nothing here can distinguish a better rule from a
 * looser one, so both arrive as "this changed, say why" and the reason ends up in a commit
 * message rather than nowhere.
 *
 * What this does **not** protect: the live agent. A prompt or model change moves no stored
 * record, so this gate stays green through it. Catching that costs a live run, and the
 * alternative — a gate that spends money on every push — is a gate someone turns off.
 */

const repoRoot = resolve(__dirname, '../../../..');
const RECORDS = join(repoRoot, 'docs/releases/v0.6/runs');
const LABELS = join(repoRoot, 'docs/eval/labels');
const BASELINE = join(repoRoot, 'docs/eval/baseline.json');

const baseline = JSON.parse(readFileSync(BASELINE, 'utf8')) as Baseline;

async function scoreEverything(): Promise<Record<string, BaselineEntry>> {
  const entries: Record<string, BaselineEntry> = {};
  for (const loaded of await loadRunRecords(RECORDS)) {
    if (!loaded.load.ok) continue;
    const record = loaded.load.record;
    const label = await loadRunLabel(LABELS, record.runId);
    if (!label.ok) continue;
    const { scorecard, ruleAgreement } = scoreLabeledRun(record, label.label);
    entries[record.runId] = toBaselineEntry(
      scorecard,
      loaded.file,
      'by-label',
      ruleAgreement,
    );
  }
  return entries;
}

describe('the committed baseline', () => {
  it('covers the runs that have labels, and nothing else', () => {
    // A baseline naming runs that no longer exist would pass by measuring nothing.
    expect(Object.keys(baseline.runs).sort()).toEqual([
      '3437b196-86a6-47a9-bd96-29e2229d697f',
      'f4a67ed8-149e-42d8-bb5a-42470e030e09',
    ]);
  });

  it('records the numbers run 11 actually earned', () => {
    const run11 = baseline.runs['3437b196-86a6-47a9-bd96-29e2229d697f'];
    expect(run11).toMatchObject({
      recall: { numerator: 2, denominator: 3 },
      citationAccuracy: { numerator: 2, denominator: 3 },
      severityMeanSignedDelta: 2,
      totalTokens: 68_157,
    });
  });
});

describe('scoring the frozen corpus today', () => {
  it('reproduces the committed baseline exactly', async () => {
    const differences = compareToBaseline(await scoreEverything(), baseline);
    if (differences.length > 0)
      throw new Error(describeDifferences(differences));
    expect(differences).toEqual([]);
  });
});

describe('the gate fails when it should', () => {
  /**
   * A gate nobody has watched reject anything is not known to be a gate. Each case below
   * doctors the baseline and checks that the difference is both caught and labeled with the
   * right direction, so a failure message tells an operator what happened rather than only
   * that something did.
   */
  let current: Record<string, BaselineEntry>;
  const RUN_11 = '3437b196-86a6-47a9-bd96-29e2229d697f';

  beforeAll(async () => {
    current = await scoreEverything();
  });

  function doctored(changes: Partial<BaselineEntry>): Baseline {
    const run = baseline.runs[RUN_11];
    if (!run) throw new Error('run 11 is not in the baseline');
    return {
      ...baseline,
      runs: { ...baseline.runs, [RUN_11]: { ...run, ...changes } },
    };
  }

  it('catches citation accuracy getting worse, and says so', () => {
    // Baseline claims 3/3; the corpus scores 2/3. That is a regression.
    const differences = compareToBaseline(
      current,
      doctored({ citationAccuracy: { numerator: 3, denominator: 3 } }),
    );
    expect(differences).toContainEqual({
      runId: RUN_11,
      measure: 'citationAccuracy',
      was: '3/3',
      now: '2/3',
      direction: 'worse',
    });
  });

  it('catches an improvement too, and calls it an improvement', () => {
    const differences = compareToBaseline(
      current,
      doctored({ citationAccuracy: { numerator: 1, denominator: 3 } }),
    );
    expect(differences).toContainEqual({
      runId: RUN_11,
      measure: 'citationAccuracy',
      was: '1/3',
      now: '2/3',
      direction: 'better',
    });
  });

  it('knows that fewer false alarms is better, not worse', () => {
    // Direction is per measure. A lower duplicate rate is an improvement, and a gate that
    // reported it as a regression would train everyone to ignore the gate.
    const differences = compareToBaseline(
      current,
      doctored({ duplicateRate: { numerator: 2, denominator: 3 } }),
    );
    expect(differences).toContainEqual({
      runId: RUN_11,
      measure: 'duplicateRate',
      was: '2/3',
      now: '0/3',
      direction: 'better',
    });
  });

  it('catches the matcher silently reclassifying an outcome', () => {
    const run = baseline.runs[RUN_11];
    if (!run) throw new Error('run 11 is not in the baseline');
    const differences = compareToBaseline(
      current,
      doctored({ outcomes: { ...run.outcomes, near_miss: 0, unkeyed: 1 } }),
    );
    expect(differences.map((d) => d.measure).sort()).toEqual([
      'outcomes.near_miss',
      'outcomes.unkeyed',
    ]);
  });

  it('catches a stored record being edited after the fact', () => {
    // totalTokens comes from the record, so it can only move if the record moved.
    const differences = compareToBaseline(
      current,
      doctored({ totalTokens: 1 }),
    );
    expect(differences).toContainEqual({
      runId: RUN_11,
      measure: 'totalTokens',
      was: '1',
      now: '68157',
      direction: 'changed',
    });
  });

  it('catches the rule drifting away from the reader', () => {
    const differences = compareToBaseline(
      current,
      doctored({ ruleAgreement: { numerator: 3, denominator: 3 } }),
    );
    expect(differences).toContainEqual({
      runId: RUN_11,
      measure: 'ruleAgreement',
      was: '3/3',
      now: '2/3',
      direction: 'worse',
    });
  });

  it('catches precision becoming unavailable when it used to be there', () => {
    const differences = compareToBaseline(
      current,
      doctored({ precision: null }),
    );
    expect(differences).toContainEqual({
      runId: RUN_11,
      measure: 'precision',
      was: 'n/a',
      now: '2/3',
      direction: 'changed',
    });
  });

  it('catches a run disappearing from the corpus', () => {
    /**
     * The failure mode of every test suite that quietly stops running. Without this,
     * deleting a label would make the gate pass by measuring less.
     */
    const rest = Object.fromEntries(
      Object.entries(current).filter(([runId]) => runId !== RUN_11),
    );
    const differences = compareToBaseline(rest, baseline);
    expect(differences).toContainEqual({
      runId: RUN_11,
      measure: 'presence',
      was: 'scored',
      now: 'missing',
      direction: 'changed',
    });
  });

  it('catches a run appearing that nobody put in the baseline', () => {
    const run = current[RUN_11];
    if (!run) throw new Error('run 11 did not score');
    const differences = compareToBaseline(
      { ...current, 'a-new-run': run },
      baseline,
    );
    expect(differences).toContainEqual({
      runId: 'a-new-run',
      measure: 'presence',
      was: 'not in baseline',
      now: 'scored',
      direction: 'changed',
    });
  });
});

describe('the failure message', () => {
  it('says what changed and how to regenerate deliberately', () => {
    const message = describeDifferences([
      {
        runId: 'abcdef1234',
        measure: 'citationAccuracy',
        was: '3/3',
        now: '2/3',
        direction: 'worse',
      },
    ]);
    expect(message).toContain('citationAccuracy: 3/3 -> 2/3 (worse)');
    expect(message).toContain('--update-baseline');
  });

  it('says plainly when nothing changed', () => {
    expect(describeDifferences([])).toBe('scores match the committed baseline');
  });
});
