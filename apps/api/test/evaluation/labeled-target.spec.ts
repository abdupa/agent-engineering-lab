import { cp, mkdtemp, rm, writeFile, unlink, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  loadAnswerKey,
  verifyTarget,
  countLines,
} from '../../src/evaluation/target-verify';
import type { AnswerKey } from '../../src/evaluation/answer-key.schema';

/**
 * The real target, checked against the real key.
 *
 * The tampering cases below matter more than the passing one. A key that agrees with its
 * target today is easy; what the design needs is that a key which has fallen out of date
 * fails loudly, because line numbers stay valid-looking after an edit and a stale key
 * would go on producing confident numbers for a measurement that had quietly stopped
 * being real.
 */

const TARGET = resolve(
  __dirname,
  '../../../..',
  'docs/eval/targets/small-service',
);

let key: AnswerKey;

beforeAll(async () => {
  const load = await loadAnswerKey(TARGET);
  if (!load.ok) throw new Error(`${load.reason}: ${load.detail}`);
  key = load.key;
});

describe('the small-service key', () => {
  it('loads', () => {
    expect(key.target).toBe('small-service');
  });

  it('matches the target exactly', async () => {
    const verified = await verifyTarget(TARGET, key);
    if (!verified.ok) {
      throw new Error(
        `target drifted: ${verified.problems
          .map((problem) => `${problem.kind} ${problem.path}`)
          .join(', ')}`,
      );
    }
    expect(verified).toEqual({ ok: true, files: 6, defects: 7 });
  });

  it('claims to list every defect', () => {
    // Only defensible because every line was written for this purpose. A key over real
    // code sets this false, and an unmatched finding there is unclassified, not wrong.
    expect(key.exhaustive).toBe(true);
  });
});

describe('the shape of the labeled set', () => {
  it('carries two control files that should produce nothing', () => {
    const clean = key.files.filter((file) => file.expected === 'clean');
    expect(clean.map((file) => file.path).sort()).toEqual([
      'format.ts',
      'health.ts',
    ]);
  });

  it('spreads severity rather than rating everything high', () => {
    /**
     * Run 11 rated three findings high for a defect needing an attacker who already had
     * write access. A key that was all-high could not have measured that, because every
     * guess would agree. The low entry is the one that matters: SS-007 is a missing await
     * on a timestamp, and a finding rating it high is inflating.
     */
    const counts = key.defects.reduce<Record<string, number>>(
      (totals, defect) => ({
        ...totals,
        [defect.severity]: (totals[defect.severity] ?? 0) + 1,
      }),
      {},
    );
    expect(counts).toEqual({ high: 4, medium: 2, low: 1 });
  });

  it('places defects across four files, not all in one', () => {
    const paths = new Set(key.defects.map((defect) => defect.path));
    expect([...paths].sort()).toEqual([
      'config.ts',
      'db.ts',
      'files.ts',
      'session.ts',
    ]);
  });

  it('explains every defect well enough for a person to score by hand', () => {
    expect(key.defects.every((defect) => defect.why.length >= 100)).toBe(true);
  });
});

describe('each keyed span really contains the defect it names', () => {
  /**
   * The hashes prove the files have not changed. They prove nothing about whether the
   * line numbers point anywhere sensible — a key could hash correctly and cite line 4 of
   * every file, and every test above would still pass.
   *
   * Each defect is anchored to text that must appear inside its own span. Between this
   * and the hashes, neither half of the key can drift without a test failing: edit a file
   * and the digest breaks, move a line number and the anchor breaks.
   */
  const anchors: Record<string, string> = {
    'SS-001': 'reporting-prod-',
    'SS-002': "WHERE email = '${email}'",
    'SS-003': 'return readFile(join(this.root, name));',
    'SS-004': 'return true;',
    'SS-005': 'Math.random()',
    'SS-006': 'is validated against the account store',
    'SS-007': 'this.query(',
  };

  it('anchors every defect in the key', () => {
    expect(Object.keys(anchors).sort()).toEqual(
      key.defects.map((defect) => defect.id).sort(),
    );
  });

  it.each(Object.entries(anchors))('%s', async (id, anchor) => {
    const defect = key.defects.find((candidate) => candidate.id === id);
    if (!defect) throw new Error(`${id} is not in the key`);

    const text = await readFile(join(TARGET, key.tree, defect.path), 'utf8');
    const span = text
      .split('\n')
      .slice(defect.line - 1, defect.endLine)
      .join('\n');

    expect(span).toContain(anchor);
  });

  it('does not anchor SS-004 on the successful return', async () => {
    // files.ts returns true twice. The defect is the one in the catch block, and a span
    // covering the other would be a key that quietly points at correct code.
    const defect = key.defects.find((candidate) => candidate.id === 'SS-004');
    if (!defect) throw new Error('SS-004 is not in the key');
    const text = await readFile(join(TARGET, key.tree, defect.path), 'utf8');
    const span = text
      .split('\n')
      .slice(defect.line - 1, defect.endLine)
      .join('\n');
    expect(span).toContain('catch');
  });
});

describe('the key is not readable from inside the audited tree', () => {
  it('sits outside it', async () => {
    /**
     * Structural, and the most important property here. An agent pointed at this target
     * reads `src/`. A key stored inside that directory would be a file the agent could
     * open, and every score taken afterwards would be worthless.
     */
    const verified = await verifyTarget(TARGET, key);
    expect(verified.ok).toBe(true);
    await expect(
      readFile(join(TARGET, key.tree, 'key.json')),
    ).rejects.toThrow();
  });

  it('is not listed among the keyed files', () => {
    const paths = key.files.map((file) => file.path);
    expect(paths).not.toContain('key.json');
    expect(paths).not.toContain('README.md');
  });
});

describe('a target that has drifted from its key', () => {
  let sandbox: string;
  let copy: string;

  beforeEach(async () => {
    sandbox = await mkdtemp(join(tmpdir(), 'target-'));
    copy = join(sandbox, 'small-service');
    await cp(TARGET, copy, { recursive: true });
  });

  afterEach(async () => {
    await rm(sandbox, { recursive: true, force: true });
  });

  it('passes before anything is touched', async () => {
    expect((await verifyTarget(copy, key)).ok).toBe(true);
  });

  it('reports a hash mismatch when a keyed file is edited', async () => {
    // Someone "fixing" a planted defect is the realistic version of this.
    const file = join(copy, 'src', 'config.ts');
    const text = await readFile(file, 'utf8');
    await writeFile(file, text.replace('reporting-prod-', 'redacted-'));

    const verified = await verifyTarget(copy, key);
    expect(verified.ok).toBe(false);
    if (!verified.ok) {
      expect(verified.problems).toEqual([
        { kind: 'hash_mismatch', path: 'config.ts' },
      ]);
    }
  });

  it('reports a whitespace-only edit, which a formatter would make', async () => {
    const file = join(copy, 'src', 'format.ts');
    await writeFile(file, `${await readFile(file, 'utf8')}\n`);

    const verified = await verifyTarget(copy, key);
    expect(verified.ok).toBe(false);
    if (!verified.ok) expect(verified.problems[0]?.kind).toBe('hash_mismatch');
  });

  it('reports a missing file', async () => {
    await unlink(join(copy, 'src', 'db.ts'));
    const verified = await verifyTarget(copy, key);
    expect(verified.ok).toBe(false);
    if (!verified.ok) {
      expect(verified.problems).toEqual([
        { kind: 'file_missing', path: 'db.ts' },
      ]);
    }
  });

  it('reports a file nobody labeled', async () => {
    await writeFile(join(copy, 'src', 'extra.ts'), 'export const x = 1;\n');
    const verified = await verifyTarget(copy, key);
    expect(verified.ok).toBe(false);
    if (!verified.ok) {
      expect(verified.problems).toEqual([
        { kind: 'unkeyed_file', path: 'extra.ts' },
      ]);
    }
  });

  it('collects every problem instead of stopping at the first', async () => {
    await unlink(join(copy, 'src', 'db.ts'));
    await writeFile(join(copy, 'src', 'config.ts'), 'export const x = 1;\n');
    const verified = await verifyTarget(copy, key);
    expect(verified.ok).toBe(false);
    if (!verified.ok) expect(verified.problems.length).toBe(2);
  });

  it('reports a defect whose line has fallen off the end of its file', async () => {
    const stale: AnswerKey = {
      ...key,
      defects: key.defects.map((defect) =>
        defect.id === 'SS-001'
          ? { ...defect, line: 900, endLine: 901 }
          : defect,
      ),
    };
    const verified = await verifyTarget(copy, stale);
    expect(verified.ok).toBe(false);
    if (!verified.ok) {
      expect(verified.problems).toEqual([
        { kind: 'line_out_of_range', path: 'config.ts', defectId: 'SS-001' },
      ]);
    }
  });

  it('does not report a line problem for a file that already failed', async () => {
    // One cause, one message. A missing file would otherwise be reported once for the
    // file and again for every defect on it.
    await unlink(join(copy, 'src', 'files.ts'));
    const verified = await verifyTarget(copy, key);
    expect(verified.ok).toBe(false);
    if (!verified.ok) {
      expect(verified.problems.filter((p) => p.path === 'files.ts')).toEqual([
        { kind: 'file_missing', path: 'files.ts' },
      ]);
    }
  });
});

describe('a key with no key.json behind it', () => {
  it('reports the absence without throwing', async () => {
    const sandbox = await mkdtemp(join(tmpdir(), 'empty-target-'));
    const load = await loadAnswerKey(sandbox);
    expect(load).toMatchObject({ ok: false, reason: 'unreadable_key' });
    await rm(sandbox, { recursive: true, force: true });
  });
});

describe('counting lines the way a reader does', () => {
  it.each([
    ['', 0],
    ['one', 1],
    ['one\n', 1],
    ['one\ntwo', 2],
    ['one\ntwo\n', 2],
    ['one\n\n', 2],
  ])('counts %p as %i', (text, expected) => {
    // A trailing newline ends the last line rather than starting an empty one. Getting
    // this wrong by one would make every last-line defect look out of range.
    expect(countLines(text)).toBe(expected);
  });
});
