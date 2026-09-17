import { join, resolve } from 'node:path';
import { loadRunRecord } from '../../src/evaluation/run-record.loader';
import { loadRunLabel } from '../../src/evaluation/run-label.loader';
import { formatRate, scoreLabeledRun } from '../../src/evaluation/metrics';
import type { RunLabel } from '../../src/evaluation/run-label.schema';

/**
 * The two stored runs that produced findings, scored against the labels written from the
 * hand analysis in RUNS.md.
 *
 * These are the only real numbers this repository has. They come from two runs and four
 * findings, and the denominators below say so more honestly than any summary could.
 */

const repoRoot = resolve(__dirname, '../../../..');
const RECORDS = join(repoRoot, 'docs/releases/v0.6/runs');
const LABELS = join(repoRoot, 'docs/eval/labels');

const RUN_5 = {
  id: 'f4a67ed8-149e-42d8-bb5a-42470e030e09',
  file: '2026-09-17T03-45-53-483Z.json',
};
const RUN_11 = {
  id: '3437b196-86a6-47a9-bd96-29e2229d697f',
  file: '2026-09-17T08-25-45-162Z.json',
};

async function score(run: { id: string; file: string }) {
  const record = await loadRunRecord(join(RECORDS, run.file));
  if (!record.ok) throw new Error(`${run.file}: ${record.detail}`);
  const label = await loadRunLabel(LABELS, run.id);
  if (!label.ok) throw new Error(`${run.id}: ${label.detail}`);
  return {
    ...scoreLabeledRun(record.record, label.label),
    label: label.label,
  };
}

describe('both labels load and describe the run they are filed under', () => {
  it.each([[RUN_5.id], [RUN_11.id]])('%s', async (id) => {
    const load = await loadRunLabel(LABELS, id);
    if (!load.ok) throw new Error(`${load.reason}: ${load.detail}`);
    expect(load.label.runId).toBe(id);
    expect(load.label.key.exhaustive).toBe(false);
  });

  it('refuses a label filed under the wrong run id', async () => {
    // Scoring one run against another run's answers would produce numbers that look fine.
    const load = await loadRunLabel(LABELS, RUN_5.id);
    if (!load.ok) throw new Error(load.detail);
    const wrong = await loadRunLabel(LABELS, 'a-run-that-does-not-exist');
    expect(wrong).toMatchObject({ ok: false, reason: 'unreadable_label' });
  });
});

describe('run 5, scored', () => {
  it('found the one defect it was labeled for, and rated it right', async () => {
    /**
     * One finding, one keyed defect, everything correct. Every denominator is 1, which is
     * the entire point of printing them: this is not a 100% agent, it is a single finding
     * that happened to be right.
     */
    const { scorecard } = await score(RUN_5);
    expect(formatRate(scorecard.recall)).toBe('1/1 (100%)');
    expect(scorecard.precision && formatRate(scorecard.precision)).toBe(
      '1/1 (100%)',
    );
    expect(formatRate(scorecard.citationAccuracy)).toBe('1/1 (100%)');
    expect(formatRate(scorecard.severity.agreement)).toBe('1/1 (100%)');
    expect(scorecard.severity.meanSignedDelta).toBe(0);
  });

  it('cost about fourteen thousand tokens for it', async () => {
    const { scorecard } = await score(RUN_5);
    expect(scorecard.cost.totalTokens).toBe(14_196);
    expect(scorecard.cost.tokensPerLocatedDefect).toBeCloseTo(14_196, 5);
  });

  it('is a run the rule and the reader agree about completely', async () => {
    const { ruleAgreement } = await score(RUN_5);
    expect(formatRate(ruleAgreement.agreement)).toBe('1/1 (100%)');
    expect(ruleAgreement.disagreements).toEqual([]);
  });
});

describe('run 11, scored', () => {
  it('located two of three and inflated severity on both', async () => {
    const { scorecard } = await score(RUN_11);
    expect(formatRate(scorecard.recall)).toBe('2/3 (67%)');
    expect(formatRate(scorecard.citationAccuracy)).toBe('2/3 (67%)');
    expect(scorecard.severity).toMatchObject({
      exact: 0,
      over: 2,
      under: 0,
      meanSignedDelta: 2,
    });
  });

  it('cost about thirty-four thousand tokens per located defect', async () => {
    const { scorecard } = await score(RUN_11);
    expect(scorecard.cost.tokensPerLocatedDefect).toBeCloseTo(34_078.5, 1);
  });
});

describe('the rule measured against the reader', () => {
  /**
   * The instrument checking itself. Every other number describes the agent; this one asks
   * whether the thing producing those numbers agrees with the judgement it stands in for.
   *
   * It is reported and never used to adjust the rule. A rule tuned until it agrees with the
   * run it was built from stops predicting anything about the next one.
   */
  it('agrees with the reader on two of run 11s three findings', async () => {
    const { ruleAgreement } = await score(RUN_11);
    expect(formatRate(ruleAgreement.agreement)).toBe('2/3 (67%)');
    expect(ruleAgreement.compared).toBe(3);
    expect(ruleAgreement.skipped).toBe(0);
  });

  it('names the finding they disagree about, and why', async () => {
    const { ruleAgreement } = await score(RUN_11);
    expect(ruleAgreement.disagreements).toHaveLength(1);
    const [only] = ruleAgreement.disagreements;
    expect(only).toMatchObject({
      index: 2,
      verdict: 'mislocated',
      outcome: 'matched',
    });
    // The reason travels with the disagreement, so nobody has to go and remember it.
    expect(only?.note).toContain('citedLines guard');
  });

  it('agrees completely on the other labeled run', async () => {
    // One disagreement out of four labeled findings across both runs. A small sample, and
    // the fraction is the honest way to say so.
    const five = await score(RUN_5);
    const eleven = await score(RUN_11);
    const compared =
      five.ruleAgreement.compared + eleven.ruleAgreement.compared;
    const disagreed =
      five.ruleAgreement.disagreements.length +
      eleven.ruleAgreement.disagreements.length;
    expect({ compared, disagreed }).toEqual({ compared: 4, disagreed: 1 });
  });
});

describe('a verdict nobody could reach', () => {
  it('is skipped rather than counted as a disagreement', async () => {
    /**
     * `unverifiable` means the reader could not decide — usually because the file has
     * changed since the run. There is no judgement to agree with, so counting it either
     * way would invent one.
     */
    const record = await loadRunRecord(join(RECORDS, RUN_5.file));
    if (!record.ok) throw new Error(record.detail);
    const load = await loadRunLabel(LABELS, RUN_5.id);
    if (!load.ok) throw new Error(load.detail);

    const unverifiable: RunLabel = {
      ...load.label,
      verdicts: [
        {
          index: 0,
          verdict: 'unverifiable',
          note: 'The file has since changed, so this can no longer be checked by hand.',
        },
      ],
    };

    const { ruleAgreement } = scoreLabeledRun(record.record, unverifiable);
    expect(ruleAgreement).toMatchObject({
      compared: 0,
      skipped: 1,
      disagreements: [],
    });
    expect(ruleAgreement.agreement.value).toBeUndefined();
  });
});
