import { z } from 'zod';
import type { Workspace } from './workspace';

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
    /** Omit for a file-level claim that names no single line. */
    line: z.number().int().positive().optional(),
    /** Inclusive end of a span. Defaults to `line` when omitted. */
    endLine: z.number().int().positive().optional(),
    severity: z.enum(SEVERITIES),
    claim: z.string().trim().min(1).max(500),
  })
  .refine(
    (finding) => finding.endLine === undefined || finding.line !== undefined,
    {
      message: 'endLine requires line',
    },
  )
  .refine(
    (finding) =>
      finding.endLine === undefined ||
      finding.line === undefined ||
      finding.endLine >= finding.line,
    { message: 'endLine must not precede line' },
  );

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
 * Adds the workspace-dependent check: the cited file must exist inside the audited tree.
 * A model can invent a plausible path as easily as a real one.
 */
export function createLocatedFindingSchema(workspace: Workspace) {
  return FindingRequestSchema.refine(
    async (finding) => {
      try {
        await workspace.resolveExisting(finding.path);
        return true;
      } catch {
        return false;
      }
    },
    { message: 'Finding path does not exist in the audited workspace' },
  );
}
