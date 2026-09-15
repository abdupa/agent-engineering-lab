import { ChunkSchema, DocumentSchema } from './retrieval.schema';
import type { Chunk, Document } from './retrieval.schema';

/** Fixed Unicode-code-point windows, always zero overlap. */
export function chunkDocument(document: Document, chunkSize = 500): Chunk[] {
  if (!Number.isSafeInteger(chunkSize) || chunkSize <= 0) {
    throw new Error('Chunk size must be a positive safe integer');
  }
  const parsed = DocumentSchema.parse(document);
  const points = Array.from(parsed.text);
  const chunks: Chunk[] = [];
  for (let offset = 0; offset < points.length; offset += chunkSize) {
    const text = points.slice(offset, offset + chunkSize).join('');
    if (!text.trim()) continue;
    const index = chunks.length;
    chunks.push(
      ChunkSchema.parse({
        id: JSON.stringify([parsed.id, index]),
        documentId: parsed.id,
        source: parsed.source,
        text,
        index,
        ...(parsed.metadata === undefined ? {} : { metadata: parsed.metadata }),
      }),
    );
  }
  return chunks;
}
