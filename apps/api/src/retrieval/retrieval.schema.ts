import { z } from 'zod';

const identifier = z.string().trim().min(1);
const content = z.string().refine((value) => value.trim().length > 0);
const metadata = z.record(z.string(), z.string()).optional();

export const DocumentSchema = z.object({
  id: identifier,
  source: identifier,
  text: content,
  metadata,
});

export const ChunkSchema = z.object({
  id: identifier,
  documentId: identifier,
  source: identifier,
  text: content,
  index: z.number().int().nonnegative(),
  metadata,
});

export const RetrievalQuerySchema = z.object({
  text: z.string().trim().min(1),
  topK: z.number().int().positive(),
});

export const RetrievalResultSchema = z.object({
  matches: z.array(
    z.object({
      chunk: ChunkSchema,
      // Retriever-specific numeric data; no ranking direction or probability implied.
      score: z.number().finite(),
    }),
  ),
});

export type Document = z.infer<typeof DocumentSchema>;
export type Chunk = z.infer<typeof ChunkSchema>;
export type RetrievalQuery = z.infer<typeof RetrievalQuerySchema>;
export type RetrievalResult = z.infer<typeof RetrievalResultSchema>;
