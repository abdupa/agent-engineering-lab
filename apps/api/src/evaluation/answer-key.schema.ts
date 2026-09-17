import { z } from 'zod';
import { SEVERITIES } from '../audit/finding.schema';

/**
 * The answer key for a labeled target: which files were written, which of them carry
 * planted defects, where those defects are, and how severe each one actually is.
 *
 * A key is a test fixture and is trusted exactly as far as one — it lives in the
 * repository, it changes through review, and it is never generated from a model's output.
 * A key written by the thing being measured measures nothing.
 */

/** A path inside the audited tree. Relative, no traversal, no absolute escape. */
const TreePathSchema = z
  .string()
  .trim()
  .min(1)
  .max(400)
  .refine((path) => !path.startsWith('/'), { message: 'path must be relative' })
  .refine((path) => !path.split('/').includes('..'), {
    message: 'path must not traverse upward',
  });

export const KeyedFileSchema = z.object({
  path: TreePathSchema,
  /** SHA-256 of the file's bytes, so a target that drifts from its key says so. */
  sha256: z
    .string()
    .regex(/^[0-9a-f]{64}$/, 'must be a lowercase sha256 digest'),
  /**
   * `clean` files are controls. They exist so false positives are measurable at all:
   * without a file that should produce nothing, an agent that flags everything and an
   * agent that flags the right things score the same on recall.
   */
  expected: z.enum(['defects', 'clean']),
});

export const KeyedDefectSchema = z.object({
  /**
   * A prefix naming the target and a three-digit number: SS-001, R11-002. Digits are
   * allowed after the first character so a run number can appear in the prefix, which is
   * how labels over real runs name theirs.
   */
  id: z.string().regex(/^[A-Z][A-Z0-9]{1,5}-\d{3}$/, 'must look like SS-001'),
  path: TreePathSchema,
  /**
   * `line` to `endLine` is the span a finding may cite and still be counted as located
   * correctly, not a claim that the defect occupies every one of those lines. A defect
   * in a three-line call expression can honestly be cited at any of the three.
   */
  line: z.number().int().positive(),
  endLine: z.number().int().positive(),
  severity: z.enum(SEVERITIES),
  summary: z.string().trim().min(1).max(200),
  /**
   * Why this is a defect, in enough detail that a person scoring a finding by hand can
   * decide whether the finding is about this defect or about something else. Long on
   * purpose: a key whose reasoning is missing becomes unusable the moment the person who
   * wrote it forgets what they meant.
   */
  why: z.string().trim().min(40).max(4000),
});

export const AnswerKeySchema = z
  .object({
    target: z.string().trim().min(1).max(100),
    version: z.number().int().positive(),
    createdAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD'),
    /** The subdirectory the agent audits. The key itself must live outside it. */
    tree: TreePathSchema,
    /**
     * Whether the listed defects are claimed to be all of them.
     *
     * Required, with no default, because the answer changes what an unmatched finding
     * means. On an exhaustive target — one written from scratch for evaluation — a finding
     * matching no keyed defect is a false positive. On a key over real code it is
     * unclassified and goes to a person, because the agent may have found something true
     * that nobody planted. Defaulting either way would quietly pick a scoring policy.
     */
    exhaustive: z.boolean(),
    description: z.string().trim().min(40).max(4000),
    files: z.array(KeyedFileSchema).min(1),
    defects: z.array(KeyedDefectSchema),
  })
  .superRefine((key, ctx) => {
    const byPath = new Map(key.files.map((file) => [file.path, file]));

    if (byPath.size !== key.files.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['files'],
        message: 'file paths must be unique',
      });
    }

    const ids = new Set<string>();
    key.defects.forEach((defect, index) => {
      if (ids.has(defect.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['defects', index, 'id'],
          message: 'defect ids must be unique',
        });
      }
      ids.add(defect.id);

      if (defect.endLine < defect.line) {
        ctx.addIssue({
          code: 'custom',
          path: ['defects', index, 'endLine'],
          message: 'endLine must not precede line',
        });
      }

      const file = byPath.get(defect.path);
      if (!file) {
        ctx.addIssue({
          code: 'custom',
          path: ['defects', index, 'path'],
          message: 'defect names a file the key does not list',
        });
      } else if (file.expected === 'clean') {
        // Otherwise a control quietly stops being a control and the false-positive
        // measurement silently becomes something else.
        ctx.addIssue({
          code: 'custom',
          path: ['defects', index, 'path'],
          message: 'defect is on a file marked clean',
        });
      }
    });

    const withDefects = new Set(key.defects.map((defect) => defect.path));
    key.files.forEach((file, index) => {
      if (file.expected === 'defects' && !withDefects.has(file.path)) {
        ctx.addIssue({
          code: 'custom',
          path: ['files', index, 'expected'],
          message: 'file is marked as carrying defects but the key lists none',
        });
      }
    });
  });

export type AnswerKey = z.infer<typeof AnswerKeySchema>;
export type KeyedDefect = z.infer<typeof KeyedDefectSchema>;
export type KeyedFile = z.infer<typeof KeyedFileSchema>;

export const KEY_REJECTION = 'key_rejected' as const;

export type AnswerKeyLoad =
  | { readonly ok: true; readonly key: AnswerKey }
  | {
      readonly ok: false;
      readonly reason: 'unreadable_key' | 'unparseable_key' | 'key_rejected';
      /** Field paths and issue codes. Never a value from the key. */
      readonly detail: string;
    };

export function parseAnswerKey(value: unknown): AnswerKeyLoad {
  const result = AnswerKeySchema.safeParse(value);
  if (result.success) return { ok: true, key: result.data };
  return {
    ok: false,
    reason: KEY_REJECTION,
    detail: result.error.issues
      .slice(0, 8)
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.code}`)
      .join('; '),
  };
}

export function parseAnswerKeyText(text: string): AnswerKeyLoad {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return {
      ok: false,
      reason: 'unparseable_key',
      detail: `${text.length} characters, not valid JSON`,
    };
  }
  return parseAnswerKey(value);
}
