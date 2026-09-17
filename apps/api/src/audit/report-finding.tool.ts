import { open } from 'node:fs/promises';
import { z } from 'zod';
import type { Tool } from '../tools/tool';
import { citedLines, createLocatedFindingSchema } from './finding.schema';
import type { Finding, FindingRequest } from './finding.schema';
import type { Workspace } from './workspace';

/** Bounded so a cited span cannot pull an arbitrary amount of a file into a finding. */
const MAX_SCAN_BYTES = 262_144;
const MAX_EVIDENCE_LINES = 20;
const MAX_EVIDENCE_CHARS = 2_000;

const outputSchema = z.object({
  recorded: z.literal(true),
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

/** Reads the cited lines from the file, so evidence comes from the source, not the model. */
async function readCitedLines(
  workspace: Workspace,
  request: FindingRequest,
): Promise<string | undefined> {
  const cited = citedLines(request);
  if (cited.line === undefined) return undefined;

  const absolute = await workspace.resolveExisting(request.path);
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
      '(high, medium or low), claim (what is wrong, in your own words). Do not send the ' +
      'source text — the cited lines are read from the file and attached for you.',
    requiredPermissions: ['audit:report'],
    inputSchema: createLocatedFindingSchema(workspace),
    outputSchema,
    execute: async (request) => {
      const evidence = await readCitedLines(workspace, request);
      const total = collector.add({
        path: request.path,
        severity: request.severity,
        claim: request.claim,
        // Null is normalized away: a recorded Finding carries a line or nothing.
        ...citedLines(request),
        ...(evidence === undefined ? {} : { evidence }),
      });
      return {
        recorded: true as const,
        totalFindings: total,
        ...(evidence === undefined ? {} : { evidence }),
      };
    },
  };
}
