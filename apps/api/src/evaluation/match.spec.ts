import {
  NEAR_MISS_LINES,
  countOutcomes,
  matchFindings,
  normalizePath,
} from './match';
import type { AnswerKey } from './answer-key.schema';
import type { StoredFinding } from './run-record.schema';

/**
 * Every number this release produces depends on this rule, so the cases below are the ones
 * that decide whether it is generous or strict, not a sample of easy ones.
 *
 * The rule: a finding matches when it names the same file and its cited span overlaps the
 * keyed span by at least one line.
 */

const key: AnswerKey = {
  target: 'test',
  version: 1,
  createdAt: '2026-09-17',
  tree: 'src',
  exhaustive: true,
  description:
    'A key used only by these tests, with two defects on one file and one on another.',
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
      summary: 'A three-line defect',
      why: 'Spans a call expression, so any of its three lines is an honest citation.',
    },
    {
      id: 'TS-002',
      path: 'a.ts',
      line: 40,
      endLine: 40,
      severity: 'low',
      summary: 'A one-line defect',
      why: 'A single line, used to check that a one-line span behaves like any other.',
    },
    {
      id: 'TS-003',
      path: 'b.ts',
      line: 7,
      endLine: 9,
      severity: 'medium',
      summary: 'A defect on the other file',
      why: 'On a different file, so a right-line-wrong-file finding has somewhere to aim.',
    },
  ],
};

function finding(over: Partial<StoredFinding> = {}): StoredFinding {
  return {
    path: 'a.ts',
    line: 21,
    severity: 'high',
    claim: 'Something is wrong here',
    ...over,
  };
}

const outcomesOf = (findings: StoredFinding[]) =>
  matchFindings(findings, key).findings.map((match) => match.outcome);

describe('the line a finding cites', () => {
  it.each([[20], [21], [22]])('matches at line %i, inside the span', (line) => {
    const result = matchFindings([finding({ line })], key);
    expect(result.findings[0]).toMatchObject({
      outcome: 'matched',
      defectId: 'TS-001',
    });
  });

  it('matches a one-line keyed defect on its exact line', () => {
    const result = matchFindings([finding({ line: 40, severity: 'low' })], key);
    expect(result.findings[0]).toMatchObject({
      outcome: 'matched',
      defectId: 'TS-002',
    });
  });

  it('does not match one line before the span', () => {
    // The keyed span is already the tolerance. Adding more on top would double-count it
    // and let a vaguer citation score the same as an accurate one.
    expect(outcomesOf([finding({ line: 19 })])).toEqual(['near_miss']);
  });

  it('does not match one line after the span', () => {
    expect(outcomesOf([finding({ line: 23 })])).toEqual(['near_miss']);
  });

  it('matches when the finding span overlaps the keyed span at one end', () => {
    expect(outcomesOf([finding({ line: 15, endLine: 20 })])).toEqual([
      'matched',
    ]);
  });

  it('matches when the finding span swallows the keyed span', () => {
    expect(outcomesOf([finding({ line: 1, endLine: 99 })])).toEqual([
      'matched',
    ]);
  });

  it('does not match a finding span that stops one line short', () => {
    expect(outcomesOf([finding({ line: 10, endLine: 19 })])).toEqual([
      'near_miss',
    ]);
  });
});

describe('near misses', () => {
  /**
   * Run 11 cited grep.tool.ts:67 for a defect on line 65. Right file, right defect, two
   * lines off. Without this outcome that is indistinguishable from a finding that was
   * simply wrong, and those two need completely different responses.
   */
  it('records how far off the citation was', () => {
    const result = matchFindings([finding({ line: 24 })], key);
    expect(result.findings[0]).toMatchObject({
      outcome: 'near_miss',
      defectId: 'TS-001',
      lineDistance: 2,
    });
  });

  it.each([[1], [NEAR_MISS_LINES]])(
    'still reports a near miss %i lines away',
    (gap) => {
      expect(outcomesOf([finding({ line: 22 + gap })])).toEqual(['near_miss']);
    },
  );

  it('stops reporting one line beyond the window', () => {
    expect(outcomesOf([finding({ line: 22 + NEAR_MISS_LINES + 1 })])).toEqual([
      'unkeyed',
    ]);
  });

  it('leaves the defect missed, because a near miss is not a find', () => {
    const result = matchFindings([finding({ line: 24 })], key);
    expect(result.missed).toContain('TS-001');
  });

  it('does not claim the defect, so a later accurate finding still matches', () => {
    const result = matchFindings(
      [finding({ line: 24 }), finding({ line: 21 })],
      key,
    );
    expect(result.findings.map((match) => match.outcome)).toEqual([
      'near_miss',
      'matched',
    ]);
    expect(result.missed).not.toContain('TS-001');
  });

  it('picks the closer defect when two are within the window', () => {
    // Line 37 is 3 from TS-002 (line 40) and 15 from TS-001. The nearer one wins.
    const result = matchFindings([finding({ line: 37 })], key);
    expect(result.findings[0]).toMatchObject({
      defectId: 'TS-002',
      lineDistance: 3,
    });
  });
});

describe('the file a finding names', () => {
  it('does not match the right line on the wrong file', () => {
    /**
     * Line 21 sits inside TS-001's span, but TS-001 is on a.ts. On b.ts that line is
     * twelve away from the only defect there, so it is not even a near miss: a line
     * number carries no meaning once the file is wrong.
     */
    expect(outcomesOf([finding({ path: 'b.ts', line: 21 })])).toEqual([
      'unkeyed',
    ]);
  });

  it('confines near misses to the file the defect is on', () => {
    // b.ts:12 is three lines from TS-003 and therefore a near miss there. The same
    // distance measured against a defect on another file would mean nothing.
    const result = matchFindings([finding({ path: 'b.ts', line: 12 })], key);
    expect(result.findings[0]).toMatchObject({
      outcome: 'near_miss',
      defectId: 'TS-003',
      lineDistance: 3,
    });
  });

  it('reports a finding on a control file as unkeyed', () => {
    const result = matchFindings([finding({ path: 'clean.ts' })], key);
    expect(result.findings[0]).toMatchObject({
      outcome: 'unkeyed',
      file: 'keyed_clean',
    });
  });

  it('reports a finding on a file the key has never heard of', () => {
    const result = matchFindings([finding({ path: 'invented.ts' })], key);
    expect(result.findings[0]).toMatchObject({
      outcome: 'unkeyed',
      file: 'unknown',
    });
  });

  it('separates a control file from an unknown one', () => {
    // A finding on a control is a false alarm on code somebody vouched for. A finding on
    // an unknown file may mean the audit ran against the wrong tree. Same outcome, and
    // the standing is what tells them apart.
    const result = matchFindings(
      [finding({ path: 'clean.ts' }), finding({ path: 'invented.ts' })],
      key,
    );
    expect(result.findings.map((match) => match.file)).toEqual([
      'keyed_clean',
      'unknown',
    ]);
  });
});

describe('paths that are written differently', () => {
  it.each([['./a.ts'], ['a.ts'], ['a.ts/'], [' a.ts ']])(
    'treats %p as a.ts',
    (path) => {
      expect(outcomesOf([finding({ path })])).toEqual(['matched']);
    },
  );

  it('does not let a bare name claim a defect keyed under a directory', () => {
    /**
     * Paths are compared exactly, never by suffix. Suffix matching would make a run
     * against the wrong root half-work, which is worse than failing outright because the
     * numbers would still look plausible.
     */
    const nested: AnswerKey = {
      ...key,
      files: [
        { path: 'vendor/a.ts', sha256: 'd'.repeat(64), expected: 'defects' },
      ],
      defects: [{ ...key.defects[0]!, path: 'vendor/a.ts' }],
    };
    const result = matchFindings([finding({ path: 'a.ts' })], nested);
    expect(result.findings[0]).toMatchObject({
      outcome: 'unkeyed',
      file: 'unknown',
    });
  });
});

describe('a finding that cites no line at all', () => {
  it('is reported separately rather than matched or rejected', () => {
    /**
     * Counting it as a match would let "something is wrong in a.ts" score as having
     * located a defect. Counting it as a false positive would punish a claim that may be
     * perfectly true. It is left for a person.
     */
    const result = matchFindings([finding({ line: undefined })], key);
    expect(result.findings[0]).toMatchObject({
      outcome: 'file_only',
      file: 'keyed_with_defects',
    });
  });

  it('leaves every defect on that file missed', () => {
    const result = matchFindings([finding({ line: undefined })], key);
    expect(result.missed).toEqual(['TS-001', 'TS-002', 'TS-003']);
  });

  it('is unkeyed when the file carries no defects', () => {
    expect(
      outcomesOf([finding({ path: 'clean.ts', line: undefined })]),
    ).toEqual(['unkeyed']);
  });
});

describe('two findings reaching the same defect', () => {
  it('counts the first and marks the second a duplicate', () => {
    expect(outcomesOf([finding({ line: 20 }), finding({ line: 22 })])).toEqual([
      'matched',
      'duplicate',
    ]);
  });

  it('decides by the order the agent produced them, not by which cites better', () => {
    // Judging which of two findings is better written is exactly what this release
    // refuses to automate, so order is the tiebreak.
    const result = matchFindings(
      [finding({ line: 20, endLine: 22 }), finding({ line: 21 })],
      key,
    );
    expect(result.findings.map((match) => match.outcome)).toEqual([
      'matched',
      'duplicate',
    ]);
  });

  it('does not count a duplicate as a second find', () => {
    const result = matchFindings(
      [finding({ line: 20 }), finding({ line: 21 }), finding({ line: 22 })],
      key,
    );
    expect(result.missed).toEqual(['TS-002', 'TS-003']);
    expect(countOutcomes(result)).toMatchObject({ matched: 1, duplicate: 2 });
  });
});

describe('a finding overlapping more than one keyed defect', () => {
  const overlapping: AnswerKey = {
    ...key,
    defects: [
      { ...key.defects[0]!, id: 'TS-010', line: 10, endLine: 30 },
      { ...key.defects[0]!, id: 'TS-011', line: 20, endLine: 22 },
    ],
  };

  it('prefers the defect it overlaps most', () => {
    const result = matchFindings(
      [finding({ line: 10, endLine: 15 })],
      overlapping,
    );
    expect(result.findings[0]?.defectId).toBe('TS-010');
  });

  it('prefers the tighter span when the overlap is equal', () => {
    // A one-line citation overlaps both by exactly one line. The narrower keyed span is
    // the more specific claim, so it wins.
    const result = matchFindings([finding({ line: 21 })], overlapping);
    expect(result.findings[0]?.defectId).toBe('TS-011');
  });

  it('gives the same answer whatever order the defects sit in', () => {
    const reversed: AnswerKey = {
      ...overlapping,
      defects: [...overlapping.defects].reverse(),
    };
    expect(
      matchFindings([finding({ line: 21 })], reversed).findings[0]?.defectId,
    ).toBe('TS-011');
  });
});

describe('severity, once a finding has matched', () => {
  it('reports exact agreement', () => {
    const result = matchFindings(
      [finding({ line: 21, severity: 'high' })],
      key,
    );
    expect(result.findings[0]).toMatchObject({
      severityAgreement: 'exact',
      severityDelta: 0,
    });
  });

  it('reports inflation with its size', () => {
    /**
     * TS-002 is keyed low. A finding calling it high is inflating by two ranks, which is
     * the behaviour run 11 showed and the thing a single accuracy number would hide.
     */
    const result = matchFindings(
      [finding({ line: 40, severity: 'high' })],
      key,
    );
    expect(result.findings[0]).toMatchObject({
      defectId: 'TS-002',
      severityAgreement: 'over',
      severityDelta: 2,
    });
  });

  it('reports understatement', () => {
    const result = matchFindings([finding({ line: 21, severity: 'low' })], key);
    expect(result.findings[0]).toMatchObject({
      severityAgreement: 'under',
      severityDelta: -2,
    });
  });

  it('says nothing about severity for a finding that did not match', () => {
    const result = matchFindings([finding({ line: 24 })], key);
    expect(result.findings[0]?.severityAgreement).toBeUndefined();
  });
});

describe('a run that found nothing', () => {
  it('misses every defect and reports no findings', () => {
    const result = matchFindings([], key);
    expect(result.findings).toEqual([]);
    expect(result.missed).toEqual(['TS-001', 'TS-002', 'TS-003']);
  });

  it('reports a zero for every outcome rather than leaving them absent', () => {
    // An absent key in a report reads as "not measured". A zero reads as "measured, none".
    expect(countOutcomes(matchFindings([], key))).toEqual({
      matched: 0,
      duplicate: 0,
      near_miss: 0,
      file_only: 0,
      unkeyed: 0,
    });
  });
});

describe('a perfect run', () => {
  it('matches every defect and misses none', () => {
    const result = matchFindings(
      [
        finding({ path: 'a.ts', line: 21, severity: 'high' }),
        finding({ path: 'a.ts', line: 40, severity: 'low' }),
        finding({ path: 'b.ts', line: 8, severity: 'medium' }),
      ],
      key,
    );
    expect(result.missed).toEqual([]);
    expect(countOutcomes(result)).toMatchObject({ matched: 3 });
    expect(
      result.findings.every((match) => match.severityAgreement === 'exact'),
    ).toBe(true);
  });
});

describe('normalizePath', () => {
  it.each([
    ['./src/a.ts', 'src/a.ts'],
    ['src\\a.ts', 'src/a.ts'],
    ['  src/a.ts  ', 'src/a.ts'],
    ['src/a.ts//', 'src/a.ts'],
    ['a.ts', 'a.ts'],
  ])('%p becomes %p', (input, expected) => {
    expect(normalizePath(input)).toBe(expected);
  });
});
