import { z } from 'zod';
import {
  ChunkSchema,
  RetrievalQuerySchema,
  RetrievalResultSchema,
} from './retrieval.schema';
import type {
  Chunk,
  RetrievalQuery,
  RetrievalResult,
} from './retrieval.schema';
import type { Retriever } from './retriever';

function tokens(text: string): Set<string> {
  return new Set(text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);
}

export class LexicalRetriever implements Retriever {
  private readonly chunks: Chunk[];

  constructor(chunks: readonly Chunk[]) {
    this.chunks = z.array(ChunkSchema).parse(chunks);
  }

  retrieve(query: RetrievalQuery): Promise<RetrievalResult> {
    const parsed = RetrievalQuerySchema.parse(query);
    const queryTokens = tokens(parsed.text);
    const matches = this.chunks
      .map((chunk, order) => {
        const chunkTokens = tokens(chunk.text);
        const score = [...queryTokens].filter((token) =>
          chunkTokens.has(token),
        ).length;
        return { chunk, score, order };
      })
      .filter((match) => match.score > 0)
      .sort(
        (left, right) => right.score - left.score || left.order - right.order,
      )
      .slice(0, parsed.topK)
      .map(({ chunk, score }) => ({ chunk, score }));
    return Promise.resolve(RetrievalResultSchema.parse({ matches }));
  }
}
