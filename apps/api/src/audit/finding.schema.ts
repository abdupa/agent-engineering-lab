import { z } from 'zod';
import type { Workspace } from './workspace';

export const SEVERITIES = ['high', 'medium', 'low'] as const;

/**
 * Structural contract only. A valid Finding proves the shape is right and the quoted
 * evidence is present as text — not that the claim follows from the evidence, and not
 * that the defect is real. Checking that is verification, which this release does not
 * contain.
 */
export const FindingSchema = z.object({
  /** Workspace-relative path. Never absolute, never traversing. */
  path: z.string().trim().min(1).max(400),
  /** Omitted for file-level findings that name no single line. */
  line: z.number().int().positive().optional(),
  severity: z.enum(SEVERITIES),
  claim: z.string().trim().min(1).max(500),
  evidence: z.string().trim().min(1).max(2000),
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
 * Adds the workspace-dependent check: the cited file must actually exist inside the
 * audited tree. A model can invent a plausible path as easily as a real one, and a
 * finding pointing at nothing is worse than no finding.
 *
 * This mirrors how grounded generation validates that citation IDs belong to the
 * evidence actually supplied: structure is checked by the standalone schema, and the
 * request-dependent part is checked where the request context exists.
 */
export function createLocatedFindingSchema(workspace: Workspace) {
  return FindingSchema.refine(
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
