import type { RetrievalQuery, RetrievalResult } from './retrieval.schema';

export interface Retriever {
  /** Returns validated matches; score interpretation belongs to the implementation. */
  retrieve(query: RetrievalQuery): Promise<RetrievalResult>;
}
