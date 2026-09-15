# Deterministic retrieval baseline

[chunkDocument](../../apps/api/src/retrieval/chunk-document.ts) validates documents
and emits exact source slices in fixed code-point windows (500 default, zero overlap).
Whitespace-only candidates disappear; emitted indexes stay sequential. Chunk IDs
are JSON strings of [documentId, index]. Source and metadata are copied. These IDs
are deterministic references, not immutable content identities or provenance proof.

[LexicalRetriever](../../apps/api/src/retrieval/lexical-retriever.ts) implements the
small [Retriever contract](../../apps/api/src/retrieval/retriever.ts) over supplied
validated chunks. Lowercase Unicode letter/number token sets yield distinct overlap
counts. For query 'cat cat dog', 'cat dog dog' scores 2 and 'cat' scores 1. Ties keep
supplied order; zero overlap is omitted; at most topK matches are returned. Empty
corpora and punctuation-only valid queries return empty results. Metadata has no
filter semantics. Input corpus and returned results are isolated parsed copies.

The key concept is an explainable deterministic baseline before semantic retrieval.
Scores are specific counts, not probability, correctness or a scale shared with
future retrievers. Chunk boundaries may split words/graphemes and separate context;
this is not final chunking guidance. No stemming, synonyms, normalization, model
calls, embeddings, storage or agent integration is part of this baseline. The
separate SemanticRetriever provides embedding-based mechanics. See
[ADR-014](../adr/ADR-014-deterministic-retrieval-baseline.md) for exact conventions.
