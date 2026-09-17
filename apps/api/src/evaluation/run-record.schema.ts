import { z } from 'zod';
import type { AgentRunErrorCode } from '../agent/agent-run.error';
import { SEVERITIES } from '../audit/finding.schema';

/**
 * A recorded live run, as `scripts/live-audit.ts` writes it to disk.
 *
 * v0.6 wrote these so results would be evidence rather than terminal scrollback. Nothing
 * read them back. v0.7 makes them the input to scoring, which turns the file format into
 * a contract: fields may be added, but removing or renaming one invalidates every record
 * already stored, and those records cannot be regenerated without paying for the runs again.
 */

/**
 * The finding shape **as stored**, defined here rather than imported from the audit module.
 *
 * This looks like duplication and is deliberate. `FindingSchema` describes what the audit
 * tool produces today; this describes what is already sitting in files written weeks ago.
 * Importing the live one would mean that any future change to a finding retroactively
 * invalidates history — a record written in September would stop parsing because a field
 * was added in November, and the evidence would be lost to a refactor rather than to a
 * decision. The two are expected to look alike. They are not required to stay alike.
 *
 * `SEVERITIES` is imported because the severity vocabulary is shared by definition: a
 * scorer comparing a stored severity to a keyed one must be comparing the same three words.
 */
export const StoredFindingSchema = z
  .object({
    path: z.string().trim().min(1).max(400),
    line: z.number().int().positive().optional(),
    endLine: z.number().int().positive().optional(),
    severity: z.enum(SEVERITIES),
    claim: z.string().trim().min(1).max(500),
    /** Read from the file by the tool. Absent for a file-level finding that cites no line. */
    evidence: z.string().optional(),
  })
  /**
   * These refinements check the record's own internal consistency, not the current
   * writer's rules. A span that ends before it starts describes no lines at all, so a
   * scorer could only turn it into a nonsense comparison; refusing it at load is the
   * honest handling.
   *
   * Refinements are safe here and forbidden in `FindingRequestSchema` for the reason
   * recorded there: that schema is converted and sent to the provider, and a refinement
   * makes it unrepresentable. This one is never sent anywhere.
   */
  .refine(
    (finding) => finding.endLine === undefined || finding.line !== undefined,
    {
      message: 'endLine requires line',
      path: ['endLine'],
    },
  )
  .refine(
    (finding) =>
      finding.endLine === undefined ||
      finding.line === undefined ||
      finding.endLine >= finding.line,
    { message: 'endLine must not precede line', path: ['endLine'] },
  );

export type StoredFinding = z.infer<typeof StoredFindingSchema>;

/**
 * Every outcome a record may carry: a completed run, or the run-level failure code.
 *
 * The `satisfies` line is the reason this list is written out rather than inferred. Adding
 * a code to `AgentRunErrorCode` without adding it here fails the build, which is the only
 * way this list stays current — a record written by a newer build and rejected by an older
 * schema is a loud failure, and that is preferable to a silent one.
 */
const RUN_ERROR_CODES = {
  INVALID_INPUT: true,
  DECISION_FAILED: true,
  INVALID_DECISION: true,
  LOOP_LIMIT: true,
  BUDGET_EXCEEDED: true,
  TIMEOUT: true,
  CANCELLED: true,
  INTERNAL: true,
} satisfies Record<AgentRunErrorCode, true>;

export const RUN_OUTCOMES = [
  'complete',
  ...(Object.keys(RUN_ERROR_CODES) as AgentRunErrorCode[]),
] as const;

export const UsageSchema = z
  .object({
    calls: z.number().int().nonnegative(),
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    totalTokens: z.number().int().nonnegative(),
  })
  .refine(
    (usage) => usage.totalTokens === usage.inputTokens + usage.outputTokens,
    {
      message: 'totalTokens must equal inputTokens + outputTokens',
      path: ['totalTokens'],
    },
  );

export const RunRecordSchema = z.object({
  /**
   * An opaque correlation key, not required to be a UUID. Every stored record happens to
   * carry one, but demanding the format would reject a record from a different producer
   * for no gain — nothing here does anything with the id except print it and join on it.
   */
  runId: z.string().trim().min(1).max(200),
  startedAt: z.iso.datetime(),
  /**
   * Required, with no default. A score with no model attached says nothing, because the
   * model is the main thing a score is about. A record missing it is unscoreable, and
   * saying so is more useful than guessing which model produced it.
   */
  model: z.string().trim().min(1).max(200),
  maxIterations: z.number().int().positive(),
  /**
   * Optional because the four oldest records predate the token budget entirely. The string
   * form is what the script writes when no budget is set; no stored record exercises it
   * yet, and rejecting it would fail the first unbudgeted run rather than any run so far.
   */
  maxTokens: z
    .union([z.number().int().positive(), z.literal('unbounded')])
    .optional(),
  /** Optional for the same reason: it did not exist before the typed transport landed. */
  typedArguments: z.boolean().optional(),
  rubric: z.string().min(1).max(4000),
  outcome: z.enum(RUN_OUTCOMES),
  toolCalls: z.number().int().nonnegative(),
  usage: UsageSchema,
  summary: z.string().trim().min(1).max(4000),
  findings: z.array(StoredFindingSchema),
});

export type RunRecord = z.infer<typeof RunRecordSchema>;

/**
 * Why a record could not be turned into a score. Never a zero.
 *
 * A record that will not load says so. Reporting it as a run that found nothing would be
 * a claim about the agent that the data does not support, and it is the exact way an
 * evaluation harness starts lying: a parse failure and a genuinely empty run are
 * indistinguishable once both are written down as `0`.
 */
export const UNSCOREABLE_REASONS = [
  'unreadable_file',
  'empty_file',
  'unparseable_json',
  'schema_rejected',
] as const;

export type UnscoreableReason = (typeof UNSCOREABLE_REASONS)[number];

export type RunRecordLoad =
  | { readonly ok: true; readonly record: RunRecord }
  | {
      readonly ok: false;
      readonly reason: UnscoreableReason;
      /** Field paths and issue codes. Never a value from the record — see below. */
      readonly detail: string;
    };

/**
 * Describes what failed using field paths and issue codes only.
 *
 * Zod's own messages quote the offending input ("expected number, received \"...\""),
 * and a record holds a customer's source code in `evidence` and a description of its
 * weaknesses in `claim`. A diagnostic that helpfully echoes the bad field would put both
 * into a log line. Paths and codes locate the problem precisely enough to fix it and
 * carry nothing from the file.
 */
function describeIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 8)
    .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.code}`)
    .join('; ');
}

/** Validates an already-parsed value. No I/O, so it is safe to call on anything. */
export function parseRunRecord(value: unknown): RunRecordLoad {
  const result = RunRecordSchema.safeParse(value);
  return result.success
    ? { ok: true, record: result.data }
    : {
        ok: false,
        reason: 'schema_rejected',
        detail: describeIssues(result.error),
      };
}

/** Turns record text into a record, naming which of the two stages failed. */
export function parseRunRecordText(text: string): RunRecordLoad {
  if (text.trim() === '') {
    return { ok: false, reason: 'empty_file', detail: 'no content' };
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    // The parser's message carries a fragment of the text, so it is not reported.
    return {
      ok: false,
      reason: 'unparseable_json',
      detail: `${text.length} characters, not valid JSON`,
    };
  }
  return parseRunRecord(value);
}
