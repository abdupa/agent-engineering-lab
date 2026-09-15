# ADR-015 — Embedding-only capability and in-memory cosine retrieval

Status: Accepted

## Decision

EmbeddingProvider.embed(text) returns a numeric vector asynchronously. It is domain/
provider-neutral and separate from generation-only ModelProvider. No concrete
provider adapter or registration is added. Tests supply deterministic fake vectors.

SemanticRetriever.create explicitly validates/copies chunks and embeds each once,
sequentially. It publishes an index only after every vector validates. Vectors must
be nonempty, finite, nonzero and dimensionally consistent. Query vectors must match
the indexed dimension. An empty index has no dimension; each retrieval still embeds
and validates its query, then returns no matches. Providers must use a consistent
embedding space across indexing and querying; equal dimensions alone cannot prove it.

Vectors are copied and normalized internally: divide by maximum absolute component,
then by the scaled norm to avoid overflow/underflow for extreme finite magnitudes.
Cosine is the dot product of unit vectors, clamped to [-1,1] for floating-point drift.
Sort descending with exact ties preserving corpus order and truncate to topK. No
minimum similarity threshold: weak, zero or negative similarities can be returned.
Scores are not probabilities, confidence, truth or comparable to lexical counts.

Malformed vectors throw fixed Invalid embedding vector errors. Provider rejection
becomes Embedding generation failed without raw causes. Chunk/query/result validation
uses existing Zod conventions. Results are parsed copies. Retriever, ModelProvider,
ToolExecutor, AgentState, orchestration and domain contracts are unchanged.

## Evidence and limits

Fake embeddings verify indexing lifecycle, query embedding, cosine mechanics,
dimension validation, stable ranking and a controlled difference from lexical order.
They do not establish real model quality, synonym understanding, production relevance,
threshold suitability or superiority over lexical retrieval. No live calls occur.

The index is an in-memory scan with no persistence, batching framework, retries or
provider timeout policy. A real adapter needs explicit later integration/reliability
requirements. Real providers, live evidence, thresholds, vectors/databases, filtering,
hybrid/BM25 search, reranking, grounded generation, agents and memory are deferred.
No new dependency or infrastructure is needed.
