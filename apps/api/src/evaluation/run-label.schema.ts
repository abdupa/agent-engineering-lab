import { z } from 'zod';
import { AnswerKeySchema } from './answer-key.schema';

/**
 * A run against unlabeled code, labeled afterwards by a person.
 *
 * The labeled target in `docs/eval/targets/` answers "how does the agent do on a task whose
 * answers we planted". That cannot be asked of run 5 or run 11: both audited real code that
 * nobody had annotated, and both produced findings a person checked by hand and wrote up as
 * prose in RUNS.md. Prose cannot be compared to the next run.
 *
 * A label turns that reading into data. It carries two things that are deliberately not the
 * same:
 *
 * 1. **A key** — where the person confirmed the defects actually are. The existing matcher
 *    and metrics run against it unchanged, so a labeled real run is scored exactly like a
 *    synthetic target.
 * 2. **Verdicts** — what the person concluded about each finding, in their own vocabulary.
 *
 * Keeping both allows the one comparison neither alone permits: **the automated rule against
 * the human judgement**. On run 11 they disagree once, and that disagreement is now a
 * computed number rather than a paragraph somebody has to remember.
 */

export const VERDICTS = [
  /** The claim is true of this code and the citation points at it. */
  'correct',
  /** The claim is true but the citation points somewhere else. */
  'mislocated',
  /** The claim is not true of this code. */
  'false',
  /** Cannot be decided from what survives — usually because the file has since changed. */
  'unverifiable',
] as const;

export type Verdict = (typeof VERDICTS)[number];

export const FindingVerdictSchema = z.object({
  /** Position in the record's findings array. */
  index: z.number().int().nonnegative(),
  verdict: z.enum(VERDICTS),
  /**
   * The keyed defect this finding is about, when there is one. Absent for a `false`
   * verdict, which is about nothing.
   */
  defectId: z
    .string()
    .regex(/^[A-Z][A-Z0-9]{1,5}-\d{3}$/)
    .optional(),
  /** Why the person concluded this. Short is fine; empty is not. */
  note: z.string().trim().min(10).max(2000),
});

export const RunLabelSchema = z
  .object({
    runId: z.string().trim().min(1).max(200),
    labeledOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD'),
    labeledBy: z.string().trim().min(1).max(100),
    /** Where the judgement came from, so it can be re-read rather than re-litigated. */
    source: z.string().trim().min(1).max(400),
    notes: z.string().trim().min(20).max(4000),
    key: AnswerKeySchema,
    verdicts: z.array(FindingVerdictSchema),
  })
  .superRefine((label, ctx) => {
    const seen = new Set<number>();
    const ids = new Set(label.key.defects.map((defect) => defect.id));

    label.verdicts.forEach((verdict, position) => {
      if (seen.has(verdict.index)) {
        ctx.addIssue({
          code: 'custom',
          path: ['verdicts', position, 'index'],
          message: 'two verdicts for the same finding',
        });
      }
      seen.add(verdict.index);

      if (verdict.defectId !== undefined && !ids.has(verdict.defectId)) {
        ctx.addIssue({
          code: 'custom',
          path: ['verdicts', position, 'defectId'],
          message: 'verdict names a defect the key does not contain',
        });
      }

      // A finding judged true must say what it is true about, or the verdict cannot be
      // compared to anything the matcher produced.
      const needsDefect =
        verdict.verdict === 'correct' || verdict.verdict === 'mislocated';
      if (needsDefect && verdict.defectId === undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['verdicts', position, 'defectId'],
          message: 'a correct or mislocated finding must name its defect',
        });
      }

      if (verdict.verdict === 'false' && verdict.defectId !== undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['verdicts', position, 'defectId'],
          message: 'a false finding is about no defect',
        });
      }
    });

    // A key over real code cannot honestly claim to list every defect in it.
    if (label.key.exhaustive) {
      ctx.addIssue({
        code: 'custom',
        path: ['key', 'exhaustive'],
        message:
          'a label over real code must not claim to list every defect in it',
      });
    }
  });

export type RunLabel = z.infer<typeof RunLabelSchema>;
export type FindingVerdict = z.infer<typeof FindingVerdictSchema>;

export type RunLabelLoad =
  | { readonly ok: true; readonly label: RunLabel }
  | {
      readonly ok: false;
      readonly reason:
        'unreadable_label' | 'unparseable_label' | 'label_rejected';
      /** Field paths and issue codes. Never a value from the label. */
      readonly detail: string;
    };

export function parseRunLabel(value: unknown): RunLabelLoad {
  const result = RunLabelSchema.safeParse(value);
  if (result.success) return { ok: true, label: result.data };
  return {
    ok: false,
    reason: 'label_rejected',
    detail: result.error.issues
      .slice(0, 8)
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.code}`)
      .join('; '),
  };
}

export function parseRunLabelText(text: string): RunLabelLoad {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return {
      ok: false,
      reason: 'unparseable_label',
      detail: `${text.length} characters, not valid JSON`,
    };
  }
  return parseRunLabel(value);
}
