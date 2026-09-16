import { z } from 'zod';
import type { Tool } from '../tools/tool';
import { createLocatedFindingSchema } from './finding.schema';
import type { Finding } from './finding.schema';
import type { Workspace } from './workspace';

const outputSchema = z.object({
  recorded: z.literal(true),
  totalFindings: z.number().int().positive(),
});

export type ReportFindingOutput = z.infer<typeof outputSchema>;

/**
 * Collects findings for one audit run. Deliberately per-run and in-memory: this is an
 * output channel, not storage, and nothing here survives the call.
 */
export class FindingCollector {
  private readonly items: Finding[] = [];

  add(finding: Finding): number {
    this.items.push(finding);
    return this.items.length;
  }

  /** A copy, so a caller cannot mutate what the run recorded. */
  all(): Finding[] {
    return this.items.map((item) => ({ ...item }));
  }
}

/**
 * Structured emission through the controlled execution boundary, rather than asking the
 * model to encode a report inside its final text. Every recorded finding is therefore an
 * executor-validated result, on the same footing as any other tool observation.
 */
export function createReportFindingTool(
  workspace: Workspace,
  collector: FindingCollector,
): Tool<Finding, ReportFindingOutput> {
  return {
    name: 'report-finding',
    description:
      'Record one audit finding. Arguments: path (file in the codebase), line (optional ' +
      'line number), severity (high, medium or low), claim (what is wrong), evidence ' +
      '(the exact text supporting the claim).',
    requiredPermissions: ['audit:report'],
    inputSchema: createLocatedFindingSchema(workspace),
    outputSchema,
    execute: (finding) =>
      Promise.resolve({
        recorded: true as const,
        totalFindings: collector.add(finding),
      }),
  };
}
