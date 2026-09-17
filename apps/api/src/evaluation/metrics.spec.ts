import { formatRate, scoreRun } from './metrics';
import type { AnswerKey } from './answer-key.schema';
import type { RunRecord, StoredFinding } from './run-record.schema';

/**
 * Every expected value below was worked out by hand and the arithmetic written beside it.
 * A metric test that computes the expectation the same way the code does proves only that
 * the code is consistent with itself.
 */

const key: AnswerKey = {
  target: 'test',
  version: 2,
  createdAt: '2026-09-17',
  tree: 'src',
  exhaustive: true,
  description:
    'Three keyed defects across two files, plus one control file, used by the metric tests.',
  files: [
    { path: 'a.ts', sha256: 'a'.repeat(64), expected: 'defects' },
    { path: 'b.ts', sha256: 'b'.repeat(64), expected: 'defects' },
    { path: 'clean.ts', sha256: 'c'.repeat(64), expected: 'clean' },
  ],
  defects: [
    {
      id: 'TS-001',
      path: 'a.ts',
      line: 20,
      endLine: 22,
      severity: 'high',
      summary: 'First',
      why: 'Keyed high so that a finding calling it low understates by two ranks.',
    },
    {
      id: 'TS-002',
      path: 'a.ts',
      line: 40,
      endLine: 40,
      severity: 'low',
      summary: 'Second',
      why: 'Keyed low so that a finding calling it high inflates by two ranks.',
    },
    {
      id: 'TS-003',
      path: 'b.ts',
      line: 7,
      endLine: 9,
      severity: 'medium',
      summary: 'Third',
      why: 'Keyed medium so agreement in the middle of the range is exercised too.',
    },
  ],
};

function record(
  findings: StoredFinding[],
  usage: Partial<RunRecord['usage']> = {},
): RunRecord {
  const inputTokens = usage.inputTokens ?? 9_000;
  const outputTokens = usage.outputTokens ?? 1_000;
  return {
    runId: 'run-under-test',
    startedAt: '2026-09-17T08:25:45.162Z',
    model: 'gpt-5.6-luna',
    maxIterations: 20,
    rubric: '(default)',
    outcome: 'complete',
    toolCalls: findings.length + 2,
    usage: {
      calls: usage.calls ?? 5,
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
    },
    summary: 'A run made up for these tests.',
    findings,
  };
}

const f = (over: Partial<StoredFinding> = {}): StoredFinding => ({
  path: 'a.ts',
  line: 21,
  severity: 'high',
  claim: 'Something is wrong here',
  ...over,
});

describe('a run that found everything, correctly rated', () => {
  const card = scoreRun(
    record([
      f({ path: 'a.ts', line: 21, severity: 'high' }),
      f({ path: 'a.ts', line: 40, severity: 'low' }),
      f({ path: 'b.ts', line: 8, severity: 'medium' }),
    ]),
    key,
  );

  it('recalls three of three', () => {
    expect(card.recall).toEqual({ numerator: 3, denominator: 3, value: 1 });
  });

  it('is precise on three of three', () => {
    expect(card.precision).toEqual({ numerator: 3, denominator: 3, value: 1 });
  });

  it('cited all three inside their spans', () => {
    expect(card.citationAccuracy).toMatchObject({
      numerator: 3,
      denominator: 3,
    });
  });

  it('agrees on every severity, with no drift in either direction', () => {
    expect(card.severity).toMatchObject({
      exact: 3,
      over: 0,
      under: 0,
      meanSignedDelta: 0,
    });
  });

  it('raises no false alarm on the control file', () => {
    expect(card.controlFalseAlarms).toEqual({
      numerator: 0,
      denominator: 3,
      value: 0,
    });
  });

  it('reports cost per located defect', () => {
    // 10,000 tokens, 3 located: 3/10000 * 10000 = 3 per 10k, 3333.33 tokens each.
    expect(card.cost.locatedDefectsPer10kTokens).toBeCloseTo(3, 10);
    expect(card.cost.tokensPerLocatedDefect).toBeCloseTo(10_000 / 3, 10);
  });
});

describe('a run that found nothing', () => {
  const card = scoreRun(record([]), key);

  it('recalls none of three, which is a real zero', () => {
    expect(card.recall).toEqual({ numerator: 0, denominator: 3, value: 0 });
  });

  it('has no precision, because there is nothing to be right or wrong about', () => {
    // Not zero. Zero would be a claim that everything it said was wrong, and it said
    // nothing at all.
    expect(card.precision).toBeUndefined();
    expect(card.precisionUnavailable).toContain('nothing to be right or wrong');
  });

  it('has no citation accuracy either', () => {
    expect(card.citationAccuracy).toEqual({ numerator: 0, denominator: 0 });
    expect(card.citationAccuracy.value).toBeUndefined();
  });

  it('reports no cost per defect, having located none', () => {
    expect(card.cost.tokensPerLocatedDefect).toBeUndefined();
    expect(card.cost.locatedDefectsPer10kTokens).toBe(0);
  });

  it('lists every defect as missed', () => {
    expect(card.missed).toEqual(['TS-001', 'TS-002', 'TS-003']);
  });
});

describe('a citation two lines off', () => {
  // One accurate finding and one near miss. Recall counts only the located defect.
  const card = scoreRun(
    record([f({ line: 21 }), f({ line: 42, severity: 'low' })]),
    key,
  );

  it('does not count toward recall', () => {
    expect(card.recall).toMatchObject({ numerator: 1, denominator: 3 });
  });

  it('counts against precision', () => {
    /**
     * 1 matched, 1 near miss, so 1/2. A claim attached to the wrong line is worse than no
     * finding: a reviewer cannot tell it is wrong without rechecking the file, which is
     * the work the finding was supposed to save.
     */
    expect(card.precision).toEqual({
      numerator: 1,
      denominator: 2,
      value: 0.5,
    });
  });

  it('is exactly what citation accuracy measures', () => {
    expect(card.citationAccuracy).toEqual({
      numerator: 1,
      denominator: 2,
      value: 0.5,
    });
  });

  it('leaves its defect missed', () => {
    expect(card.missed).toContain('TS-002');
  });
});

describe('the same finding reported twice', () => {
  const card = scoreRun(record([f({ line: 20 }), f({ line: 22 })]), key);

  it('is counted once for recall', () => {
    expect(card.recall).toMatchObject({ numerator: 1, denominator: 3 });
  });

  it('does not dilute precision', () => {
    // Repeating a correct finding is noise, not an error. 1 matched over 1 judged.
    expect(card.precision).toEqual({ numerator: 1, denominator: 1, value: 1 });
  });

  it('is measured on its own instead', () => {
    expect(card.duplicateRate).toEqual({
      numerator: 1,
      denominator: 2,
      value: 0.5,
    });
  });
});

describe('a finding on a file the key vouches for', () => {
  const card = scoreRun(
    record([f({ line: 21 }), f({ path: 'clean.ts', line: 3 })]),
    key,
  );

  it('counts against precision on an exhaustive key', () => {
    expect(card.precision).toEqual({
      numerator: 1,
      denominator: 2,
      value: 0.5,
    });
  });

  it('is reported separately as a false alarm on a control', () => {
    expect(card.controlFalseAlarms).toEqual({
      numerator: 1,
      denominator: 2,
      value: 0.5,
    });
  });
});

describe('a key that does not claim to list every defect', () => {
  const open: AnswerKey = { ...key, exhaustive: false };

  it('cannot report precision once a finding matches nothing', () => {
    /**
     * Run 5 found two real defects in this repository that nobody had planted. Calling an
     * unmatched finding wrong would have scored the most valuable run so far as a mistake,
     * so the honest answer is that precision is not measurable here.
     */
    const card = scoreRun(
      record([f({ line: 21 }), f({ path: 'invented.ts', line: 3 })]),
      open,
    );
    expect(card.precision).toBeUndefined();
    expect(card.precisionUnavailable).toContain('1 finding(s)');
    expect(card.precisionUnavailable).toContain('unclassified');
  });

  it('still reports precision when nothing is unclassified', () => {
    // Nothing unmatched means nothing unknown, so the number is available after all.
    const card = scoreRun(record([f({ line: 21 }), f({ line: 42 })]), open);
    expect(card.precision).toEqual({
      numerator: 1,
      denominator: 2,
      value: 0.5,
    });
  });

  it('still reports citation accuracy either way', () => {
    // It only ever looks at findings already known to be about something real, so the
    // exhaustive question never arises.
    const card = scoreRun(
      record([f({ line: 21 }), f({ path: 'invented.ts', line: 3 })]),
      open,
    );
    expect(card.citationAccuracy).toMatchObject({
      numerator: 1,
      denominator: 1,
    });
  });

  it('counts findings on files it has never heard of', () => {
    const card = scoreRun(
      record([f({ path: 'invented.ts' }), f({ path: 'also-invented.ts' })]),
      open,
    );
    expect(card.findingsOnUnknownFiles).toBe(2);
  });
});

describe('severity', () => {
  it('reports inflation as a positive mean', () => {
    // TS-002 is keyed low, reported high: +2. Run 11's exact behaviour.
    const card = scoreRun(record([f({ line: 40, severity: 'high' })]), key);
    expect(card.severity).toMatchObject({
      exact: 0,
      over: 1,
      under: 0,
      meanSignedDelta: 2,
    });
  });

  it('reports understatement as a negative mean', () => {
    const card = scoreRun(record([f({ line: 21, severity: 'low' })]), key);
    expect(card.severity).toMatchObject({ under: 1, meanSignedDelta: -2 });
  });

  it('shows that a mean of zero is not the same as agreement', () => {
    /**
     * One finding two ranks high and one two ranks low average to zero. An agent that
     * inflates half its findings and understates the other half has a different problem
     * from one that gets them right, and needs a different fix, so the counts are reported
     * beside the mean rather than instead of it.
     */
    const card = scoreRun(
      record([
        f({ line: 40, severity: 'high' }),
        f({ line: 21, severity: 'low' }),
      ]),
      key,
    );
    expect(card.severity).toMatchObject({
      exact: 0,
      over: 1,
      under: 1,
      meanSignedDelta: 0,
    });
    expect(card.severity.agreement).toEqual({
      numerator: 0,
      denominator: 2,
      value: 0,
    });
  });

  it('says nothing about severity when nothing matched', () => {
    const card = scoreRun(record([f({ path: 'invented.ts' })]), key);
    expect(card.severity.meanSignedDelta).toBeUndefined();
    expect(card.severity.agreement).toEqual({ numerator: 0, denominator: 0 });
  });
});

describe('a run that spent nothing', () => {
  it('reports no rate per token rather than dividing by zero', () => {
    // Run 9 failed before any request was made: zero calls, zero tokens.
    const card = scoreRun(
      record([], { calls: 0, inputTokens: 0, outputTokens: 0 }),
      key,
    );
    expect(card.cost).toEqual({ totalTokens: 0, providerCalls: 0 });
  });
});

describe('the scorecard as a whole', () => {
  it('carries what the numbers are about', () => {
    // A score with no model, target or key version attached cannot be compared to another.
    const card = scoreRun(record([f()]), key);
    expect(card).toMatchObject({
      runId: 'run-under-test',
      model: 'gpt-5.6-luna',
      target: 'test',
      keyVersion: 2,
      exhaustive: true,
      outcome: 'complete',
      findings: 1,
      keyedDefects: 3,
    });
  });

  it('produces no single overall score', () => {
    /**
     * Deliberate. A release built to stop one number hiding the truth does not finish by
     * producing one number. If a field named score, grade or overall ever appears here,
     * this test should be the thing that objects.
     */
    const card: unknown = scoreRun(record([f()]), key);
    const fields = Object.keys(card as object);
    for (const forbidden of ['score', 'grade', 'overall', 'total', 'rating']) {
      expect(fields).not.toContain(forbidden);
    }
  });
});

describe('formatRate', () => {
  it.each([
    [{ numerator: 2, denominator: 3, value: 2 / 3 }, '2/3 (67%)'],
    [{ numerator: 1, denominator: 1, value: 1 }, '1/1 (100%)'],
    [{ numerator: 0, denominator: 7, value: 0 }, '0/7 (0%)'],
    [{ numerator: 0, denominator: 0 }, '0/0 (not measurable)'],
  ])('renders %j as %s', (value, expected) => {
    expect(formatRate(value)).toBe(expected);
  });

  it('always shows the denominator, so a sample of one cannot pass as a result', () => {
    // 1/1 and 40/40 are both 100%. Only the fraction says which one you are looking at.
    expect(formatRate({ numerator: 1, denominator: 1, value: 1 })).toContain(
      '1/1',
    );
  });
});
