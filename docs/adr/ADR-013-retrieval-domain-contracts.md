# ADR-013 — Minimal retrieval domain contracts

Status: Accepted

## Decision

V0.5-001 defines DocumentSchema, ChunkSchema, RetrievalQuerySchema and
RetrievalResultSchema with inferred TypeScript types in retrieval/retrieval.schema.ts.
They depend only on existing Zod, not model, tool, agent or storage implementations.
Object envelopes follow existing z.object conventions: unknown fields are stripped.

Document has trimmed non-empty id/source and verbatim text, rejecting text whose
trimmed value is empty. Optional metadata is a string-to-string record; values and
keys are not normalized. Chunk adds trimmed non-empty documentId and integer index
at least zero. Query text is trimmed/non-empty; topK is required and positive integer,
with no arbitrary application maximum. Existing Zod integer/finite-number semantics
apply; numeric strings are not coerced.

Result contains an ordered matches array, possibly empty. Each match contains a
validated Chunk and finite numeric score. Negative scores and scores above one are
valid. Score is retriever-specific, not probability, confidence or factual correctness;
no higher/lower interpretation is selected. Parsing preserves order without sorting
or deduplicating. No retriever interface is introduced before execution requirements.

## Tradeoffs and limits

Preserving source text avoids changing evidence while normalizing reference labels
and query whitespace. Simple metadata avoids speculative filtering syntax. Schemas
validate individual shapes, not identifier uniqueness, referenced Document existence,
Chunk.source provenance or equality with its parent. Duplicate matches remain valid.
Ordering is structural, not evidence of a ranking algorithm. These are runtime/domain
contracts, not a promise of direct provider Structured Outputs compatibility.

Chunking, retrieval, ranking, filtering, embeddings, similarity, vector infrastructure,
BM25/hybrid search, reranking, context assembly, grounded generation, persistence,
ingestion/provenance enforcement and memory remain outside this task. ModelProvider,
ToolExecutor, AgentState and orchestration contracts are unchanged. No dependency added.
