import { parseRunLabel, parseRunLabelText } from './run-label.schema';

/**
 * A label is a person's reading turned into data. It is trusted like a test fixture, so the
 * ways it can quietly contradict itself are refused at load rather than found later in a
 * number nobody can explain.
 */

function validLabel(overrides: Record<string, unknown> = {}) {
  return {
    runId: 'run-under-test',
    labeledOn: '2026-09-17',
    labeledBy: 'abe',
    source: 'docs/releases/v0.6/RUNS.md, Run 11',
    notes:
      'A label written for these tests, long enough to say what the run was and why it was read this way.',
    key: {
      target: 'real-code',
      version: 1,
      createdAt: '2026-09-17',
      tree: '.',
      exhaustive: false,
      description:
        'A key over real code, keyed where a person confirmed the defect rather than where the agent pointed.',
      files: [{ path: 'a.ts', sha256: 'a'.repeat(64), expected: 'defects' }],
      defects: [
        {
          id: 'R11-001',
          path: 'a.ts',
          line: 35,
          endLine: 35,
          severity: 'low',
          summary: 'A confirmed defect',
          why: 'Long enough to explain to a later reader why this counts as a defect at all.',
        },
      ],
    },
    verdicts: [
      {
        index: 0,
        verdict: 'correct',
        defectId: 'R11-001',
        note: 'The cited line is right and the claim is true.',
      },
    ],
    ...overrides,
  };
}

describe('a well-formed label', () => {
  it('parses', () => {
    expect(parseRunLabel(validLabel()).ok).toBe(true);
  });

  it('accepts an id with digits in its prefix', () => {
    // Labels over real runs name their defects after the run, so R11-001 must be legal.
    const load = parseRunLabel(validLabel());
    if (!load.ok) throw new Error(load.detail);
    expect(load.label.key.defects[0]?.id).toBe('R11-001');
  });
});

describe('a label that contradicts itself', () => {
  it('rejects two verdicts for the same finding', () => {
    const label = validLabel();
    const first = (label.verdicts as unknown[])[0];
    expect(parseRunLabel({ ...label, verdicts: [first, first] }).ok).toBe(
      false,
    );
  });

  it('rejects a verdict naming a defect the key does not contain', () => {
    const label = validLabel();
    expect(
      parseRunLabel({
        ...label,
        verdicts: [
          { index: 0, verdict: 'correct', defectId: 'ZZ-999', note: 'Nope.' },
        ],
      }).ok,
    ).toBe(false);
  });

  it('rejects a correct verdict that names no defect', () => {
    // Otherwise the verdict cannot be compared to anything the matcher produced, and the
    // agreement number quietly becomes a smaller sample than it appears.
    expect(
      parseRunLabel({
        ...validLabel(),
        verdicts: [{ index: 0, verdict: 'correct', note: 'True, somehow.' }],
      }).ok,
    ).toBe(false);
  });

  it('rejects a mislocated verdict that names no defect', () => {
    expect(
      parseRunLabel({
        ...validLabel(),
        verdicts: [
          { index: 0, verdict: 'mislocated', note: 'True but cited badly.' },
        ],
      }).ok,
    ).toBe(false);
  });

  it('rejects a false verdict that names one', () => {
    // A finding judged untrue is about no defect. Attaching one is a contradiction.
    expect(
      parseRunLabel({
        ...validLabel(),
        verdicts: [
          {
            index: 0,
            verdict: 'false',
            defectId: 'R11-001',
            note: 'Not true of this code.',
          },
        ],
      }).ok,
    ).toBe(false);
  });

  it('accepts unverifiable with no defect named', () => {
    expect(
      parseRunLabel({
        ...validLabel(),
        verdicts: [
          {
            index: 0,
            verdict: 'unverifiable',
            note: 'The file has changed since the run, so nobody can check it now.',
          },
        ],
      }).ok,
    ).toBe(true);
  });

  it('rejects a verdict with no reasoning behind it', () => {
    expect(
      parseRunLabel({
        ...validLabel(),
        verdicts: [
          { index: 0, verdict: 'correct', defectId: 'R11-001', note: 'ok' },
        ],
      }).ok,
    ).toBe(false);
  });
});

describe('a label that claims too much', () => {
  it('refuses to say it lists every defect in real code', () => {
    /**
     * A label describes a run against code nobody enumerated. Claiming exhaustiveness
     * would turn every finding the reader did not recognise into a false positive, which
     * is precisely the mistake that would have scored run 5's two genuine discoveries as
     * errors.
     */
    const label = validLabel();
    const key = { ...(label.key as object), exhaustive: true };
    const load = parseRunLabel({ ...label, key });
    expect(load.ok).toBe(false);
    if (!load.ok) expect(load.detail).toContain('key.exhaustive');
  });
});

describe('what a rejection is allowed to say', () => {
  const secret = 'not-a-real-credential-1111111111111111';

  it('names the field and not the value', () => {
    const load = parseRunLabel(validLabel({ labeledOn: secret }));
    if (load.ok) throw new Error('expected a rejection');
    expect(load.detail).toContain('labeledOn');
    expect(load.detail).not.toContain(secret);
  });

  it('does not echo an unparseable label', () => {
    const load = parseRunLabelText(`{"runId":"${secret}"`);
    if (load.ok) throw new Error('expected a rejection');
    expect(load).toMatchObject({ reason: 'unparseable_label' });
    expect(load.detail).not.toContain(secret);
  });
});
