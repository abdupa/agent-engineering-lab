import { join, resolve } from 'node:path';
import { loadRunRecord } from '../../src/evaluation/run-record.loader';
import { matchFindings, countOutcomes } from '../../src/evaluation/match';
import type { AnswerKey } from '../../src/evaluation/answer-key.schema';
import type { RunRecord } from '../../src/evaluation/run-record.schema';

/**
 * The rule applied to a real recorded run, against a key written from the verdicts a
 * person reached by hand in RUNS.md.
 *
 * A rule tested only on invented examples will agree with whoever invented them. This asks
 * whether it agrees with a judgement made before the rule existed, on findings produced by
 * a model that knew nothing about either.
 *
 * It agrees on two of three. The disagreement is recorded rather than tuned away, and the
 * reason is below.
 */

const RECORD = resolve(
  __dirname,
  '../../../..',
  'docs/releases/v0.6/runs/2026-09-17T08-25-45-162Z.json',
);

/**
 * Written from the hand analysis in RUNS.md, not from the source files — those have been
 * edited since the run, so their current line numbers would be about today's code rather
 * than the code the agent read.
 *
 * `exhaustive: false`: this is real code, nobody enumerated its defects, and an unmatched
 * finding here is unclassified rather than wrong.
 */
const run11Key: AnswerKey = {
  target: 'audit-tools-as-of-run-11',
  version: 1,
  createdAt: '2026-09-17',
  tree: '.',
  exhaustive: false,
  description:
    'The three TOCTOU observations run 11 reported, keyed at the lines a person confirmed by hand in RUNS.md rather than at the lines the agent cited.',
  files: [
    { path: 'read-file.tool.ts', sha256: '0'.repeat(64), expected: 'defects' },
    { path: 'grep.tool.ts', sha256: '1'.repeat(64), expected: 'defects' },
    {
      path: 'report-finding.tool.ts',
      sha256: '2'.repeat(64),
      expected: 'defects',
    },
  ],
  defects: [
    {
      id: 'R11-001',
      path: 'read-file.tool.ts',
      line: 35,
      endLine: 35,
      severity: 'low',
      summary: 'Resolve and open are separate steps',
      why: 'The hand check confirmed line 35 is the resolveExisting call the claim is about. Keyed low because the attack needs someone who can already write symlinks into the audited tree, which buys little over editing the files directly.',
    },
    {
      id: 'R11-002',
      path: 'grep.tool.ts',
      line: 65,
      endLine: 65,
      severity: 'low',
      summary: 'The path join the claim is actually about',
      why: 'RUNS.md records that the join is on line 65 and that line 67 is the NUL-byte check. The agent cited 67, which is why this entry is keyed where the defect is rather than where the finding pointed.',
    },
    {
      id: 'R11-003',
      path: 'report-finding.tool.ts',
      line: 50,
      endLine: 55,
      severity: 'low',
      summary: 'The gap between resolving at 50 and opening at 55',
      why: 'RUNS.md records the resolve on line 50 and the open on line 55, with the citedLines guard between them. The keyed span is the whole gap, because that is what the claim is about.',
    },
  ],
};

let record: RunRecord;

beforeAll(async () => {
  const load = await loadRunRecord(RECORD);
  if (!load.ok) throw new Error(`${load.reason}: ${load.detail}`);
  record = load.record;
});

describe('run 11 through the matching rule', () => {
  it('is the run this test is about', () => {
    expect(record.findings).toHaveLength(3);
    expect(record.outcome).toBe('BUDGET_EXCEEDED');
  });

  it('agrees with the hand verdict on the accurate citation', () => {
    // RUNS.md: read-file.tool.ts:35 — "Correct".
    const result = matchFindings(record.findings, run11Key);
    expect(result.findings[0]).toMatchObject({
      outcome: 'matched',
      defectId: 'R11-001',
    });
  });

  it('agrees with the hand verdict on the wrong line, and says how wrong', () => {
    /**
     * RUNS.md: grep.tool.ts:67 — "Wrong line. The join is line 65."
     *
     * The rule reports a near miss at a distance of two. That is more information than
     * the hand verdict carried: "wrong line" and "wrong by two lines on the right defect"
     * call for different responses, and only one of them is a prompt problem.
     */
    const result = matchFindings(record.findings, run11Key);
    expect(result.findings[1]).toMatchObject({
      outcome: 'near_miss',
      defectId: 'R11-002',
      lineDistance: 2,
    });
  });

  it('disagrees with the hand verdict on the third, and the disagreement is real', () => {
    /**
     * RUNS.md calls report-finding.tool.ts:51-54 a "wrong span", because the finding
     * points at the citedLines guard rather than at the resolve or the open.
     *
     * The rule calls it a match: the claim is about the gap between resolve (50) and open
     * (55), the keyed span is that gap, and 51-54 sits inside it.
     *
     * Both readings are defensible and the rule is not being bent to agree. Keeping the
     * overlap rule and recording where it differs is better than adding a special case
     * that fits one observation, because a rule tuned on the run it was built from stops
     * predicting anything about the next one.
     *
     * The practical consequence is stated plainly: citation accuracy measured this way
     * will read two in three on run 11, where the hand count said one in three. When
     * those two numbers are compared, this is why.
     */
    const result = matchFindings(record.findings, run11Key);
    expect(result.findings[2]).toMatchObject({
      outcome: 'matched',
      defectId: 'R11-003',
    });
  });

  it('catches the severity inflation the hand analysis described', () => {
    // All three were reported high. RUNS.md: "High severity is wrong by about two
    // notches." Keyed low, the rule reports every match as over by two.
    const result = matchFindings(record.findings, run11Key);
    const matched = result.findings.filter(
      (match) => match.outcome === 'matched',
    );
    expect(matched).toHaveLength(2);
    expect(
      matched.every(
        (match) =>
          match.severityAgreement === 'over' && match.severityDelta === 2,
      ),
    ).toBe(true);
  });

  it('records the defect the agent never located', () => {
    const result = matchFindings(record.findings, run11Key);
    expect(result.missed).toEqual(['R11-002']);
  });

  it('summarizes the run as two located, one cited badly', () => {
    expect(countOutcomes(matchFindings(record.findings, run11Key))).toEqual({
      matched: 2,
      duplicate: 0,
      near_miss: 1,
      file_only: 0,
      unkeyed: 0,
    });
  });
});

describe('the same findings against an empty key', () => {
  it('are unkeyed rather than wrong', () => {
    /**
     * The key declares itself not exhaustive, so a finding matching nothing is
     * unclassified. Run 5 found two genuine defects in this repository that nobody had
     * planted; a matcher treating unmatched findings as errors would have scored the most
     * valuable run so far as three mistakes.
     */
    const empty: AnswerKey = { ...run11Key, files: [], defects: [] };
    const result = matchFindings(record.findings, empty);
    expect(result.findings.map((match) => match.outcome)).toEqual([
      'unkeyed',
      'unkeyed',
      'unkeyed',
    ]);
    expect(result.findings.every((match) => match.file === 'unknown')).toBe(
      true,
    );
  });
});

describe('every stored record runs through the rule without throwing', () => {
  it('handles the eight runs that found nothing', async () => {
    // Seven of nine stored runs recorded no findings, and one recorded a single finding.
    // A matcher that only works on the interesting run is not a matcher.
    const dir = resolve(__dirname, '../../../..', 'docs/releases/v0.6/runs');
    const names = [
      '2026-09-16T06-52-14-655Z.json',
      '2026-09-17T03-45-53-483Z.json',
      '2026-09-17T08-06-23-643Z.json',
    ];
    for (const name of names) {
      const load = await loadRunRecord(join(dir, name));
      if (!load.ok) throw new Error(`${name}: ${load.detail}`);
      const result = matchFindings(load.record.findings, run11Key);
      expect(result.missed.length).toBeGreaterThan(0);
    }
  });
});
