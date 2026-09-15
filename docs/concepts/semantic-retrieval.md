# Semantic retrieval mechanics

[EmbeddingProvider](../../apps/api/src/ai/embedding-provider.ts) represents text to
vector, independently of model generation. [SemanticRetriever](../../apps/api/src/retrieval/semantic-retriever.ts)
implements the existing Retriever contract. Explicit create validates chunks and
builds an in-memory normalized vector index; queries do not rebuild the corpus.
Each query is embedded and compared by cosine similarity, with descending scores,
exact input-order ties and topK truncation. Empty corpus retrieval still validates
a query embedding but has no indexed dimension to match.

Finite, nonempty, nonzero vectors and consistent dimensions are mandatory. Internal
normalization supports unnormalized provider output and extreme finite magnitudes.
Same dimensionality is necessary but does not guarantee the same embedding space.
A real provider must keep indexing/query representation compatible.

No score threshold exists: even negative similarities can appear in topK. Scores
are not probability or factual correctness and cannot be compared numerically with
lexical overlap counts. Threshold choice requires later quality evidence.

The key concept is isolating embedding generation from retrieval/ranking mechanics.
Fake vectors demonstrate those mechanics and a scripted contrast with lexical order;
they do not demonstrate real semantic understanding. Real adapters, quality evidence,
live calls, persistence, filtering and agent integration remain deferred. See
[ADR-015](../adr/ADR-015-semantic-retrieval-foundation.md).
