import { z } from 'zod';
import type { EmbeddingProvider } from '../ai/embedding-provider';
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

function normalized(vector: unknown, dimension?: number): number[] {
  if (
    !Array.isArray(vector) ||
    vector.length === 0 ||
    (dimension !== undefined && vector.length !== dimension)
  )
    throw new Error('Invalid embedding vector');
  let scale = 0;
  // Explicit indexing rejects sparse arrays as well as non-finite components.
  for (let i = 0; i < vector.length; i++) {
    const value: unknown = vector[i];
    if (typeof value !== 'number' || !Number.isFinite(value))
      throw new Error('Invalid embedding vector');
    scale = Math.max(scale, Math.abs(value));
  }
  if (scale === 0) throw new Error('Invalid embedding vector');
  const scaled = (vector as number[]).map((value) => value / scale);
  const magnitude = Math.sqrt(
    scaled.reduce((sum, value) => sum + value * value, 0),
  );
  return scaled.map((value) => value / magnitude);
}

async function embed(
  provider: EmbeddingProvider,
  text: string,
  dimension?: number,
): Promise<number[]> {
  let vector: unknown;
  try {
    vector = await provider.embed(text);
  } catch {
    throw new Error('Embedding generation failed');
  }
  return normalized(vector, dimension);
}

export class SemanticRetriever implements Retriever {
  private constructor(
    private readonly provider: EmbeddingProvider,
    private readonly chunks: Chunk[],
    private readonly vectors: number[][],
  ) {}

  static async create(
    chunks: readonly Chunk[],
    provider: EmbeddingProvider,
  ): Promise<SemanticRetriever> {
    const parsed = z.array(ChunkSchema).parse(chunks);
    const vectors: number[][] = [];
    for (const chunk of parsed)
      vectors.push(await embed(provider, chunk.text, vectors[0]?.length));
    return new SemanticRetriever(provider, parsed, vectors);
  }

  async retrieve(query: RetrievalQuery): Promise<RetrievalResult> {
    const parsed = RetrievalQuerySchema.parse(query);
    // Even an empty index validates the query embedding; it has no indexed dimension.
    const vector = await embed(
      this.provider,
      parsed.text,
      this.vectors[0]?.length,
    );
    const matches = this.chunks
      .map((chunk, order) => {
        const indexed = this.vectors[order]!;
        const cosine = vector.reduce(
          (sum, value, index) => sum + value * indexed[index]!,
          0,
        );
        return { chunk, order, score: Math.max(-1, Math.min(1, cosine)) };
      })
      .sort(
        (left, right) => right.score - left.score || left.order - right.order,
      )
      .slice(0, parsed.topK)
      .map(({ chunk, score }) => ({ chunk, score }));
    return RetrievalResultSchema.parse({ matches });
  }
}
