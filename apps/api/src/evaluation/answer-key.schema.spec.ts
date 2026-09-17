import { parseAnswerKey, parseAnswerKeyText } from './answer-key.schema';

/**
 * The key decides what counts as right. A key that is internally inconsistent — a defect
 * on a file marked clean, two defects sharing an id, a control that quietly carries an
 * answer — produces scores that look fine and mean nothing, so the inconsistencies are
 * refused at load rather than discovered later in a number.
 */

function validKey(overrides: Record<string, unknown> = {}) {
  return {
    target: 'example',
    version: 1,
    createdAt: '2026-09-17',
    tree: 'src',
    exhaustive: true,
    description:
      'A short target written for tests, with one planted defect and one control file.',
    files: [
      { path: 'a.ts', sha256: 'a'.repeat(64), expected: 'defects' },
      { path: 'b.ts', sha256: 'b'.repeat(64), expected: 'clean' },
    ],
    defects: [
      {
        id: 'EX-001',
        path: 'a.ts',
        line: 4,
        endLine: 6,
        severity: 'high',
        summary: 'Something bad happens here',
        why: 'Long enough to be a real explanation of why this counts as a defect at all.',
      },
    ],
    ...overrides,
  };
}

describe('a well-formed key', () => {
  it('parses', () => {
    expect(parseAnswerKey(validKey()).ok).toBe(true);
  });

  it('keeps the span as written', () => {
    const load = parseAnswerKey(validKey());
    if (!load.ok) throw new Error(load.detail);
    expect(load.key.defects[0]).toMatchObject({ line: 4, endLine: 6 });
  });

  it('accepts a target with no defects at all', () => {
    // A control-only target is legitimate: it measures false positives and nothing else.
    const load = parseAnswerKey(
      validKey({
        files: [{ path: 'b.ts', sha256: 'b'.repeat(64), expected: 'clean' }],
        defects: [],
      }),
    );
    expect(load.ok).toBe(true);
  });
});

describe('internal consistency', () => {
  it('rejects two defects sharing an id', () => {
    const key = validKey();
    const first = key.defects[0];
    expect(parseAnswerKey({ ...key, defects: [first, { ...first }] }).ok).toBe(
      false,
    );
  });

  it('rejects a defect on a file the key does not list', () => {
    const key = validKey();
    const moved = { ...key.defects[0], path: 'nowhere.ts' };
    expect(parseAnswerKey({ ...key, defects: [moved] }).ok).toBe(false);
  });

  it('rejects a defect placed on a control file', () => {
    // The whole point of a control is that it contains nothing. A key that puts an answer
    // on one has stopped being able to measure false positives and does not say so.
    const key = validKey();
    const onControl = { ...key.defects[0], path: 'b.ts' };
    expect(parseAnswerKey({ ...key, defects: [onControl] }).ok).toBe(false);
  });

  it('rejects a file marked as carrying defects when the key lists none', () => {
    expect(parseAnswerKey(validKey({ defects: [] })).ok).toBe(false);
  });

  it('rejects duplicate file paths', () => {
    const key = validKey();
    const duplicated = [key.files[0], { ...key.files[0] }, key.files[1]];
    expect(parseAnswerKey({ ...key, files: duplicated }).ok).toBe(false);
  });

  it('rejects a span that ends before it starts', () => {
    const key = validKey();
    const backwards = { ...key.defects[0], line: 9, endLine: 3 };
    expect(parseAnswerKey({ ...key, defects: [backwards] }).ok).toBe(false);
  });
});

describe('fields that must be stated rather than assumed', () => {
  it('rejects a key that does not say whether it is exhaustive', () => {
    /**
     * No default, because the answer decides what an unmatched finding means: a false
     * positive on a synthetic target, unclassified on real code. Defaulting either way
     * would pick a scoring policy without anyone choosing it.
     */
    const key = validKey();
    delete (key as Record<string, unknown>).exhaustive;
    expect(parseAnswerKey(key).ok).toBe(false);
  });

  it('accepts a key that declares itself not exhaustive', () => {
    expect(parseAnswerKey(validKey({ exhaustive: false })).ok).toBe(true);
  });

  it('rejects a defect explained in fewer than forty characters', () => {
    const key = validKey();
    const thin = { ...key.defects[0], why: 'bad code' };
    expect(parseAnswerKey({ ...key, defects: [thin] }).ok).toBe(false);
  });
});

describe('paths and digests', () => {
  it.each([['/etc/passwd'], ['../outside.ts'], ['a/../../b.ts'], ['']])(
    'rejects the file path %p',
    (path) => {
      const key = validKey();
      expect(
        parseAnswerKey({
          ...key,
          files: [{ path, sha256: 'a'.repeat(64), expected: 'clean' }],
          defects: [],
        }).ok,
      ).toBe(false);
    },
  );

  it.each([['short'], ['A'.repeat(64)], ['g'.repeat(64)], ['a'.repeat(63)]])(
    'rejects the digest %p',
    (sha256) => {
      const key = validKey();
      expect(
        parseAnswerKey({
          ...key,
          files: [{ path: 'b.ts', sha256, expected: 'clean' }],
          defects: [],
        }).ok,
      ).toBe(false);
    },
  );

  it.each([['ss-001'], ['SS-1'], ['SS001'], ['TOOLONGPREFIX-001']])(
    'rejects the defect id %p',
    (id) => {
      const key = validKey();
      expect(
        parseAnswerKey({ ...key, defects: [{ ...key.defects[0], id }] }).ok,
      ).toBe(false);
    },
  );
});

describe('what a rejection is allowed to say', () => {
  const secret = 'not-a-real-credential-0000000000000000';

  it('names the field path and not the value', () => {
    const load = parseAnswerKey(validKey({ version: secret }));
    if (load.ok) throw new Error('expected a rejection');
    expect(load.detail).toContain('version');
    expect(load.detail).not.toContain(secret);
  });

  it('does not echo the text of an unparseable key', () => {
    const load = parseAnswerKeyText(`{"target":"${secret}"`);
    if (load.ok) throw new Error('expected a rejection');
    expect(load).toMatchObject({ reason: 'unparseable_key' });
    expect(load.detail).not.toContain(secret);
  });
});
