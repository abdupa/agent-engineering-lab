import { open } from 'node:fs/promises';
import { z } from 'zod';
import type { Tool } from '../tools/tool';
import { FindingRequestSchema, citedLines } from './finding.schema';
import type { Finding, FindingRequest } from './finding.schema';
import type { Workspace } from './workspace';

/** Bounded so a cited span cannot pull an arbitrary amount of a file into a finding. */
const MAX_SCAN_BYTES = 262_144;
const MAX_EVIDENCE_LINES = 20;
const MAX_EVIDENCE_CHARS = 2_000;

const outputSchema = z.object({
  recorded: z.literal(true),
  /**
   * The id of the finding just recorded. Pass it back as `replaces` to correct this
   * finding instead of adding another one beside it.
   */
  findingId: z.string(),
  /** True when this call corrected an existing finding rather than adding a new one. */
  replaced: z.boolean(),
  totalFindings: z.number().int().positive(),
  /**
   * Echoed back so the agent sees the text its citation actually resolved to. A line
   * number off by three is visible immediately instead of silently misattributing.
   */
  evidence: z.string().optional(),
});

export type ReportFindingOutput = z.infer<typeof outputSchema>;

/**
 * Collects findings for one audit run. Deliberately per-run and in-memory: this is an
 * output channel, not storage, and nothing here survives the call.
 */
export class FindingCollector {
  private readonly items: { id: string; finding: Finding }[] = [];
  private issued = 0;

  add(finding: Finding): { id: string; total: number } {
    this.issued += 1;
    const id = `f${this.issued}`;
    this.items.push({ id, finding });
    return { id, total: this.items.length };
  }

  /**
   * Overwrites an existing finding, keeping its id and its position in the report.
   *
   * A correction is the same finding said better, so it does not become a second entry and
   * does not move to the end. An unknown id throws rather than falling back to appending:
   * silently adding a finding the agent asked to replace is how the defect this fixes got
   * into the report in the first place.
   */
  replace(id: string, finding: Finding): { id: string; total: number } {
    const existing = this.items.find((item) => item.id === id);
    if (!existing) {
      throw new Error(`No finding with id ${id} to replace`);
    }
    existing.finding = finding;
    return { id, total: this.items.length };
  }

  /** A copy, so a caller cannot mutate what the run recorded. */
  all(): Finding[] {
    return this.items.map((item) => ({ ...item.finding }));
  }

  /** Ids in report order, for a caller that needs to address a finding. */
  ids(): string[] {
    return this.items.map((item) => item.id);
  }
}

/** Reads the cited lines from the file, so evidence comes from the source, not the model. */
async function readCitedLines(
  workspace: Workspace,
  request: FindingRequest,
): Promise<string | undefined> {
  // Enforced here rather than in the schema: a failure becomes a tool observation the
  // agent can act on, instead of killing the decision that produced it.
  const absolute = await workspace.resolveExisting(request.path);

  const cited = citedLines(request);
  if (cited.line === undefined) return undefined;

  const handle = await open(absolute, 'r');
  let text: string;
  try {
    const buffer = Buffer.alloc(MAX_SCAN_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, MAX_SCAN_BYTES, 0);
    text = buffer.subarray(0, bytesRead).toString('utf8');
  } finally {
    await handle.close();
  }

  const lines = text.split('\n');
  if (cited.line > lines.length) {
    // Citing a line that is not there is a defect in the finding, not evidence of one.
    throw new Error('Cited line is beyond the end of the file');
  }

  const end = Math.min(
    cited.endLine ?? cited.line,
    lines.length,
    cited.line + MAX_EVIDENCE_LINES - 1,
  );
  return lines
    .slice(cited.line - 1, end)
    .join('\n')
    .slice(0, MAX_EVIDENCE_CHARS);
}

/**
 * Structured emission through the controlled execution boundary, rather than asking the
 * model to encode a report inside its final text. Every recorded finding is therefore an
 * executor-validated result, on the same footing as any other tool observation.
 */
export function createReportFindingTool(
  workspace: Workspace,
  collector: FindingCollector,
): Tool<FindingRequest, ReportFindingOutput> {
  return {
    name: 'report-finding',
    description:
      'Record one audit finding. Arguments: path (file in the codebase), line (optional ' +
      'line number the claim is about), endLine (optional end of a span), severity ' +
      '(high, medium or low), claim (what is wrong, in your own words), replaces (the ' +
      'findingId of an earlier finding this one corrects, or null for a new finding). ' +
      'Do not send the source text — the cited lines are read from the file and attached ' +
      'for you. If the attached evidence is not what your claim is about, call this again ' +
      'with a corrected line and replaces set to the findingId you were given, so the ' +
      'report carries one corrected finding rather than two attempts.',
    requiredPermissions: ['audit:report'],
    /**
     * Structural only, deliberately.
     *
     * This schema is also the model-facing one under the typed transport, and anything
     * enforced here fails the *decision* rather than the *call* — which terminates the
     * run instead of handing the agent an observation it can correct from. Whether a
     * cited path exists is policy, and policy belongs at the executor.
     */
    inputSchema: FindingRequestSchema,
    outputSchema,
    execute: async (request) => {
      const evidence = await readCitedLines(workspace, request);
      const finding = {
        path: request.path,
        severity: request.severity,
        claim: request.claim,
        // Null is normalized away: a recorded Finding carries a line or nothing.
        ...citedLines(request),
        ...(evidence === undefined ? {} : { evidence }),
      };

      // Null and absent both mean "a new finding"; only a real id is a correction.
      const replaces = request.replaces ?? undefined;
      const { id, total } =
        replaces === undefined
          ? collector.add(finding)
          : collector.replace(replaces, finding);

      return {
        recorded: true as const,
        findingId: id,
        replaced: replaces !== undefined,
        totalFindings: total,
        ...(evidence === undefined ? {} : { evidence }),
      };
    },
  };
}
