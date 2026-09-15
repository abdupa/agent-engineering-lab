# Retrieval data contracts

[Retrieval schemas](../../apps/api/src/retrieval/retrieval.schema.ts) establish runtime
shape validation independently of retrieval execution. Document and Chunk preserve text
verbatim while rejecting blank content; reference strings and query text are trimmed.
Chunk carries a non-negative index and document reference. Metadata is an optional
string record without filtering semantics. Query requires positive integer topK.

RetrievalResult contains ordered matches with validated chunks and finite scores.
An empty array is valid. Neither sorting nor deduplication occurs. Scores may be
negative or exceed one and have no selected direction; they are not probabilities,
confidence or truth. The schema preserves order; each retriever defines its ranking policy.

The key concept is separating structural validity from semantic guarantees. A valid
chunk does not prove its document exists, its source is authentic or its identifiers
are unique. A valid match does not prove relevance or factual correctness. Retrieval
is separate from model generation, controlled tools and agent state.

These schemas do not execute retrieval or enforce provenance. Chunking, lexical and
semantic retrieval, and context assembly are separate implemented components; storage
and filtering remain deferred. See [ADR-013](../adr/ADR-013-retrieval-domain-contracts.md)
and the [system review](../releases/v0.5/REVIEW.md).
