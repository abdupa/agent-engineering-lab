import {
  RUN_OUTCOMES,
  parseRunRecord,
  parseRunRecordText,
} from './run-record.schema';

/**
 * The stored records are the only evidence v0.6 produced that cannot be regenerated
 * without paying for the runs again. This schema decides which of them still count, so
 * it is tested against both shapes that exist on disk and against the ways a file can
 * arrive broken.
 */

/** The newest shape, carrying every field the script writes today. */
function currentRecord(overrides: Record<string, unknown> = {}) {
  return {
    runId: '3437b196-86a6-47a9-bd96-29e2229d697f',
    startedAt: '2026-09-17T08:25:45.162Z',
    model: 'gpt-5.6-luna',
    maxIterations: 20,
    maxTokens: 60_000,
    typedArguments: true,
    rubric: '(default)',
    outcome: 'BUDGET_EXCEEDED',
    toolCalls: 12,
    usage: {
      calls: 13,
      inputTokens: 66_423,
      outputTokens: 1_734,
      totalTokens: 68_157,
    },
    summary:
      'Audit did not complete. 3 finding(s) recorded before the failure.',
    findings: [
      {
        path: 'read-file.tool.ts',
        line: 35,
        endLine: 35,
        severity: 'high',
        claim: 'Resolve and open are separate steps',
        evidence:
          '      const absolute = await workspace.resolveExisting(path);',
      },
    ],
    ...overrides,
  };
}

describe('a record in the current shape', () => {
  it('loads', () => {
    const load = parseRunRecord(currentRecord());
    expect(load.ok).toBe(true);
  });

  it('keeps the findings it was given', () => {
    const load = parseRunRecord(currentRecord());
    if (!load.ok) throw new Error(`expected a record: ${load.detail}`);
    expect(load.record.findings).toHaveLength(1);
    expect(load.record.findings[0]?.line).toBe(35);
  });
});

describe('a record in the older shape', () => {
  /**
   * Four of the nine stored records predate both the token budget and the typed
   * transport. Writing this schema from the newest record alone would have rejected
   * nearly half the corpus, and the obvious conclusion — that the files were broken —
   * would have been wrong.
   */
  it('loads without maxTokens or typedArguments', () => {
    const { maxTokens, typedArguments, ...older } = currentRecord();
    void maxTokens;
    void typedArguments;
    const load = parseRunRecord(older);
    expect(load.ok).toBe(true);
  });

  it('reports those fields as absent rather than inventing a default', () => {
    const { maxTokens, typedArguments, ...older } = currentRecord();
    void maxTokens;
    void typedArguments;
    const load = parseRunRecord(older);
    if (!load.ok) throw new Error(load.detail);
    expect(load.record.maxTokens).toBeUndefined();
    expect(load.record.typedArguments).toBeUndefined();
  });
});

describe('the budget field', () => {
  it('accepts the string the script writes when no budget is set', () => {
    // No stored record exercises this yet. Rejecting it would fail the first unbudgeted
    // run rather than any run made so far, which is the wrong time to find out.
    expect(parseRunRecord(currentRecord({ maxTokens: 'unbounded' })).ok).toBe(
      true,
    );
  });

  it.each([[0], [-1], [1.5], ['60000'], ['none']])(
    'rejects %p',
    (maxTokens) => {
      expect(parseRunRecord(currentRecord({ maxTokens })).ok).toBe(false);
    },
  );
});

describe('outcomes', () => {
  it('covers every run-level failure code and the success case', () => {
    expect([...RUN_OUTCOMES].sort()).toEqual(
      [
        'BUDGET_EXCEEDED',
        'CANCELLED',
        'DECISION_FAILED',
        'INTERNAL',
        'INVALID_DECISION',
        'INVALID_INPUT',
        'LOOP_LIMIT',
        'TIMEOUT',
        'complete',
      ].sort(),
    );
  });

  it.each(RUN_OUTCOMES.map((outcome) => [outcome]))('accepts %s', (outcome) => {
    expect(parseRunRecord(currentRecord({ outcome })).ok).toBe(true);
  });

  it('rejects a code that is not one of them', () => {
    // CONFIGURATION is a provider error. The runner wraps it as DECISION_FAILED, so it
    // never reaches a record — see the v0.7-001 note in the SPEC about what that costs.
    expect(parseRunRecord(currentRecord({ outcome: 'CONFIGURATION' })).ok).toBe(
      false,
    );
  });
});

describe('fields a score cannot do without', () => {
  it.each([
    ['runId'],
    ['startedAt'],
    ['model'],
    ['maxIterations'],
    ['outcome'],
    ['toolCalls'],
    ['usage'],
    ['summary'],
    ['findings'],
  ])('rejects a record with no %s', (field) => {
    const record = currentRecord();
    delete (record as Record<string, unknown>)[field];
    expect(parseRunRecord(record).ok).toBe(false);
  });

  it('names the missing field in the detail', () => {
    const record = currentRecord();
    delete (record as Record<string, unknown>).model;
    const load = parseRunRecord(record);
    if (load.ok) throw new Error('expected a rejection');
    expect(load.detail).toContain('model');
  });
});

describe('usage arithmetic', () => {
  it('rejects totals that do not add up', () => {
    // A record whose own numbers disagree is corrupt, and a cost figure derived from it
    // would be wrong in a way nothing downstream could detect.
    const load = parseRunRecord(
      currentRecord({
        usage: {
          calls: 13,
          inputTokens: 100,
          outputTokens: 20,
          totalTokens: 999,
        },
      }),
    );
    expect(load.ok).toBe(false);
    if (!load.ok) expect(load.detail).toContain('totalTokens');
  });

  it('accepts a run that spent nothing', () => {
    // Run 9 failed before any request was made. Zero is a real measurement here.
    expect(
      parseRunRecord(
        currentRecord({
          usage: {
            calls: 0,
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
          },
        }),
      ).ok,
    ).toBe(true);
  });
});

describe('stored findings', () => {
  const finding = {
    path: 'workspace.ts',
    line: 81,
    severity: 'high',
    claim: 'Symlink resolution can bypass the exclusion checks',
  };

  it('accepts a finding that cites a line and no span end', () => {
    expect(parseRunRecord(currentRecord({ findings: [finding] })).ok).toBe(
      true,
    );
  });

  it('accepts a file-level finding that cites no line at all', () => {
    const { line, ...fileLevel } = finding;
    void line;
    expect(parseRunRecord(currentRecord({ findings: [fileLevel] })).ok).toBe(
      true,
    );
  });

  it('accepts an empty findings list', () => {
    // Seven of nine stored runs found nothing. That is a result, not a malformed file.
    expect(parseRunRecord(currentRecord({ findings: [] })).ok).toBe(true);
  });

  it('rejects a span that ends before it starts', () => {
    const load = parseRunRecord(
      currentRecord({ findings: [{ ...finding, endLine: 80 }] }),
    );
    expect(load.ok).toBe(false);
    if (!load.ok) expect(load.detail).toContain('findings.0.endLine');
  });

  it('rejects an end line with no start line', () => {
    const { line, ...fileLevel } = finding;
    void line;
    expect(
      parseRunRecord(
        currentRecord({ findings: [{ ...fileLevel, endLine: 9 }] }),
      ).ok,
    ).toBe(false);
  });

  it('rejects a severity outside the shared vocabulary', () => {
    expect(
      parseRunRecord(
        currentRecord({ findings: [{ ...finding, severity: 'critical' }] }),
      ).ok,
    ).toBe(false);
  });
});

describe('forward compatibility', () => {
  it('ignores a field it has never heard of', () => {
    // Fields may be added to the writer. A reader that refused unknown keys would make
    // every future addition a breaking change to the whole stored corpus.
    const load = parseRunRecord(
      currentRecord({ costEstimate: 0.0071, currency: 'USD' }),
    );
    expect(load.ok).toBe(true);
  });
});

describe('text that is not a record', () => {
  it('reports an empty file as empty, not as unparseable', () => {
    const load = parseRunRecordText('   \n  ');
    expect(load).toMatchObject({ ok: false, reason: 'empty_file' });
  });

  it('reports truncated JSON as unparseable', () => {
    const load = parseRunRecordText('{"runId":"abc","usage":{');
    expect(load).toMatchObject({ ok: false, reason: 'unparseable_json' });
  });

  it('reports two concatenated objects as unparseable', () => {
    // The run 10 signature. Each half is valid; together they are not JSON. It cost a
    // live run before anyone knew what they were looking at.
    const one = JSON.stringify(currentRecord());
    expect(parseRunRecordText(one + one)).toMatchObject({
      ok: false,
      reason: 'unparseable_json',
    });
  });

  it('reports valid JSON of the wrong shape as rejected by the schema', () => {
    expect(parseRunRecordText('{"hello":"world"}')).toMatchObject({
      ok: false,
      reason: 'schema_rejected',
    });
  });

  it('reports a JSON array as rejected by the schema', () => {
    expect(parseRunRecordText('[]')).toMatchObject({
      ok: false,
      reason: 'schema_rejected',
    });
  });
});

describe('what a failure is allowed to say', () => {
  /**
   * A record holds a customer's source code in `evidence` and a description of its
   * weaknesses in `claim`. Zod's own messages quote the offending input, so a diagnostic
   * built from them would put both into a log line the first time a file was malformed.
   */
  const secret = 'AKIA-NOT-A-REAL-KEY-0123456789';

  it('does not echo a rejected value', () => {
    const load = parseRunRecord(currentRecord({ maxIterations: secret }));
    if (load.ok) throw new Error('expected a rejection');
    expect(load.detail).not.toContain(secret);
    expect(load.detail).toContain('maxIterations');
  });

  it('does not echo finding content', () => {
    const load = parseRunRecord(
      currentRecord({
        findings: [
          {
            path: 'secrets.ts',
            line: 0,
            severity: 'high',
            claim: secret,
            evidence: secret,
          },
        ],
      }),
    );
    if (load.ok) throw new Error('expected a rejection');
    expect(load.detail).not.toContain(secret);
  });

  it('does not echo the text of an unparseable file', () => {
    const load = parseRunRecordText(`{"claim":"${secret}"`);
    if (load.ok) throw new Error('expected a rejection');
    expect(load.detail).not.toContain(secret);
  });
});
