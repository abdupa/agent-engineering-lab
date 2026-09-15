/** Embedding-only capability; generation remains in ModelProvider. */
export interface EmbeddingProvider {
  embed(text: string): Promise<readonly number[]>;
}
