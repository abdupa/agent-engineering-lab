import { z } from 'zod';
import {
  ChunkSchema,
  RetrievalQuerySchema,
  RetrievalResultSchema,
} from '../../src/retrieval/retrieval.schema';
import type {
  Chunk,
  RetrievalQuery,
} from '../../src/retrieval/retrieval.schema';
import type { Retriever } from '../../src/retrieval/retriever';

export interface RetrievalScenario {
  name: string;
  corpus: Chunk[];
  query: RetrievalQuery;
  relevantIds: string[];
  expectedOrder?: string[];
  expectedMetrics: { precision: number; recall: number | null };
}

export function metricsAtK(
  returnedIds: readonly string[],
  relevantIds: readonly string[],
  k: number,
): { precision: number; recall: number | null } {
  if (!Number.isSafeInteger(k) || k < 1)
    throw new Error('Invalid evaluation K');
  const relevant = new Set(relevantIds);
  const hits = [...new Set(returnedIds.slice(0, k))].filter((id) =>
    relevant.has(id),
  ).length;
  return {
    precision: hits / k,
    recall: relevant.size === 0 ? null : hits / relevant.size,
  };
}

export async function evaluateScenario(
  scenario: RetrievalScenario,
  create: (corpus: Chunk[]) => Retriever | Promise<Retriever>,
): Promise<void> {
  const corpus = z.array(ChunkSchema).parse(scenario.corpus);
  const query = RetrievalQuerySchema.parse(scenario.query);
  const ids = new Set(corpus.map((chunk) => chunk.id));
  if (
    ids.size !== corpus.length ||
    scenario.relevantIds.some((id) => !ids.has(id))
  )
    throw new Error('Invalid evaluation corpus or relevance labels');
  const retriever = await create(corpus);
  const result = RetrievalResultSchema.parse(await retriever.retrieve(query));
  const returned = result.matches.map((match) => match.chunk.id);
  expect(returned.every((id) => ids.has(id))).toBe(true);
  if (scenario.expectedOrder) expect(returned).toEqual(scenario.expectedOrder);
  const metrics = metricsAtK(returned, scenario.relevantIds, query.topK);
  expect(metrics).toEqual(scenario.expectedMetrics);
  expect(metrics.precision).toBeGreaterThanOrEqual(0);
  expect(metrics.precision).toBeLessThanOrEqual(1);
  if (metrics.recall !== null) {
    expect(metrics.recall).toBeGreaterThanOrEqual(0);
    expect(metrics.recall).toBeLessThanOrEqual(1);
  }
}
