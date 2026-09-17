import { z } from 'zod';

export const SEVERITIES = ['high', 'medium', 'low'] as const;

/**
 * What the agent supplies: a location and a claim about it. Deliberately no evidence
 * text.
 *
 * Asking a model to quote source code back meant carrying quotes, braces and newlines
 * through `argumentsJson`, which encodes JSON inside a JSON string. On a long finding the
 * escaping broke and the whole envelope became unparseable — observed on two live runs.
 * Citing a line instead removes the class, and it removes a second problem with it:
 * quoted evidence was whatever the model retyped, and nothing checked it against the file.
 */
export const FindingRequestSchema = z
  .object({
    path: z.string().trim().min(1).max(400),
    /**
     * Null or omitted for a file-level claim that names no single line.
     *
     * Nullable rather than merely optional because strict Structured Outputs requires
     * every property to be present: `.optional()` alone is rejected by the API, which
     * an offline schema check caught before it reached a live call.
     */
    line: z.number().int().positive().nullable().optional(),
    /** Inclusive end of a span. Defaults to `line` when absent. */
    endLine: z.number().int().positive().nullable().optional(),
    severity: z.enum(SEVERITIES),
    claim: z.string().trim().min(1).max(500),
    /**
     * The id of a finding this one corrects, or null for a new finding.
     *
     * Run 12 is why this exists. Told to check what its citation landed on and re-report
     * with a corrected line, the agent did exactly that — the same defect at line 26, then
     * 22, then 21, converging on the right one. The tool could only append, so obeying the
     * instruction produced one defect reported three times with two wrong citations still
     * attached, and the report was worse for the agent having done what it was asked.
     *
     * Nullable rather than merely optional for the reason recorded on `line`: strict
     * Structured Outputs requires every property to be present.
     */
    replaces: z.string().trim().min(1).max(40).nullable().optional(),
  })
  .refine((finding) => finding.endLine == null || finding.line != null, {
    message: 'endLine requires line',
  })
  .refine(
    (finding) =>
      finding.endLine == null ||
      finding.line == null ||
      finding.endLine >= finding.line,
    { message: 'endLine must not precede line' },
  );

/** Null and absent mean the same thing here; the recorded Finding carries neither. */
export function citedLines(request: FindingRequest): {
  line?: number;
  endLine?: number;
} {
  return {
    ...(request.line == null ? {} : { line: request.line }),
    ...(request.endLine == null ? {} : { endLine: request.endLine }),
  };
}

export type FindingRequest = z.infer<typeof FindingRequestSchema>;

/**
 * What gets recorded. `evidence` is read from the file by the tool, never supplied by the
 * model, so a cited line and its text cannot disagree.
 */
export const FindingSchema = z.object({
  path: z.string().trim().min(1).max(400),
  line: z.number().int().positive().optional(),
  endLine: z.number().int().positive().optional(),
  severity: z.enum(SEVERITIES),
  claim: z.string().trim().min(1).max(500),
  /** Absent for file-level findings, which cite no line to quote. */
  evidence: z.string().optional(),
});

export type Finding = z.infer<typeof FindingSchema>;

export const AuditReportSchema = z.object({
  findings: z.array(FindingSchema),
  summary: z.string().trim().min(1),
  /** Completed tool calls. Not an iteration count: the runner does not return one. */
  toolCalls: z.number().int().nonnegative(),
});

export type AuditReport = z.infer<typeof AuditReportSchema>;

/**
 * The workspace-dependent check — the cited file must exist inside the audited tree —
 * lives in the tool's handler, not here.
 *
 * Under the typed transport a tool's input schema is also the model-facing schema, so a
 * refinement here would reject the *decision* and terminate the run rather than
 * returning an observation the agent could correct from. Shape belongs in the schema;
 * policy belongs at the executor.
 *
 * See `readCitedLines` in report-finding.tool.ts.
 */
