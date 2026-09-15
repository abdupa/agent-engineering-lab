import { z } from 'zod';
import { RetrievalResultSchema } from './retrieval.schema';
import type { RetrievalResult } from './retrieval.schema';

export const EvidenceSchema = z.object({
  citationId: z.string().regex(/^E[1-9][0-9]*$/),
  chunkId: z.string().trim().min(1),
  documentId: z.string().trim().min(1),
  source: z.string().trim().min(1),
  text: z.string().refine((text) => text.trim().length > 0),
});
export type Evidence = z.infer<typeof EvidenceSchema>;

export class ContextAssembler {
  assemble(result: RetrievalResult, evidenceBudget: number): Evidence[] {
    if (!Number.isSafeInteger(evidenceBudget) || evidenceBudget <= 0)
      throw new Error('Evidence budget must be a positive safe integer');
    const parsed = RetrievalResultSchema.parse(result);
    const evidence: Evidence[] = [];
    let remaining = evidenceBudget;
    for (const { chunk } of parsed.matches) {
      const length = Array.from(chunk.text).length;
      if (length > remaining) break;
      evidence.push(
        EvidenceSchema.parse({
          citationId: `E${evidence.length + 1}`,
          chunkId: chunk.id,
          documentId: chunk.documentId,
          source: chunk.source,
          text: chunk.text,
        }),
      );
      remaining -= length;
    }
    return evidence;
  }
}
