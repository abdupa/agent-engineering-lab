# v0.5 — Retrieval Engineering

Status: Released in the repository, 2026-09-15. V0.5-007 records closure.
See [RELEASE.md](RELEASE.md) for delivered scope, verification and limitations.

## Goal and learning scope

Build a small, measurable retrieval subsystem that provides relevant evidence to AI
application logic while keeping retrieval, generation and agent orchestration separate.
Teach document/chunk, query and result contracts; chunking strategy; embeddings
concepts and semantic similarity; ranking, metadata filtering, context assembly,
grounding/citation boundaries, retrieval evaluation and precision/recall concepts.
Explain when vector search is and is not appropriate.

## Architecture direction

```text
Application / Agent
  -> RetrievalService
     -> Retriever interface
        -> simple baseline
        -> semantic retriever later if justified
     -> validated RetrievalResults
  -> Context assembly
  -> ModelProvider
```

This is conceptual, not implementation authorization for the transition. Class names
and exact interfaces follow requirements. Retrieval is not hidden inside ModelProvider;
that remains the generation boundary. ToolExecutor remains the controlled action
boundary and orchestration/AgentState contracts are preserved. Neither agent nor
ModelProvider should directly depend on a specific vector database. Validate retrieved
and external data at runtime and keep tests deterministic wherever possible.

Start with contracts and the simplest retrieval baseline that demonstrates the
architecture. No vector database is assumed. Embeddings or persistence require a
concrete implementation task to establish the need and record significant decisions
in an ADR. V0.5-001 must not install vector infrastructure merely to define contracts.

## Directional tasks

| Task                                                              | Intended outcome                                                                                                                                    |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| V0.5-001 — Retrieval domain contracts                             | Define minimal document, chunk, query and result contracts with runtime validation and provider-neutral types.                                      |
| V0.5-002 — Document chunking and deterministic retrieval baseline | Establish an explicit chunking policy and simple repeatable retrieval/ranking baseline with metadata filtering as required.                         |
| V0.5-003 — Embeddings and semantic retrieval                      | Establish the semantic-retrieval requirement and compare against the baseline; justify embedding access, similarity and any infrastructure choices. |
| V0.5-004 — Context assembly and grounded generation boundary      | Define evidence selection/assembly and citation boundaries while preserving application prompt ownership and ModelProvider separation.              |
| V0.5-005 — Retrieval evaluation foundations                       | Establish repeatable labeled cases and explicit relevance/ranking/filtering criteria separate from generation quality.                              |
| V0.5-006 — Retrieval system review and mastery                    | Review boundaries, evidence, limitations and learning before further evolution.                                                                     |

These are directional outcomes. Before each implementation resolve material decisions
about fields, identity/source provenance, metadata, chunk size/overlap, ranking and
tie-breaking, query limits, filtering, empty/missing evidence, embedding model/access,
context budget and citation validation. No specific schema, algorithm, storage engine,
metric threshold or new model capability is selected by this document. Resolve missing details using [DECISION_POLICY](../../DECISION_POLICY.md): choose
L1 locally, document meaningful L2 architecture decisions in an ADR and continue,
and obtain authorization before implementing L3 decisions. Missing detail alone
does not require escalation. Planned subsequent tasks are not implementation scope.

## Evidence and evaluation direction

Measure retrieval quality separately from generation quality. Candidate concepts are
expected relevant chunks, Precision@K, Recall@K, ranking quality, missing-evidence
cases and metadata filtering correctness. Select concrete fixtures, K values, relevance
judgments and pass criteria in the evaluation task; do not implement an evaluation
framework during this transition. A retrieved chunk or citation does not itself prove
truth, entailment or a correct answer.

Normal tests remain deterministic and network-free with fake external dependencies.
Preserve all existing regressions. Completed implementation tasks run `pnpm verify` (format check, lint, typecheck,
tests, build and git diff checks). Any separate live integration
or quality evidence must be explicitly distinguished from deterministic test results.

## Important distinctions

- Retrieval is not agent memory.
- Vector search is not all search; a simple baseline may be sufficient.
- Retrieved evidence is not trusted truth.
- Context assembly selects/formats evidence; application logic still owns prompts.
- Embeddings represent data for comparison; they are not model reasoning.

## Non-goals

Unless a later task explicitly earns them, exclude long-term agent memory, Redis,
a dedicated vector database, pgvector, Weaviate/Pinecone or similar infrastructure
merely for demonstration, hybrid/BM25 search before baseline evidence, unjustified
reranking, web search, browser automation, multi-agent systems, MCP, queues/workers,
Temporal, a distributed retrieval service, Python service, frontend and production
deployment. No new dependency, persistence or vector infrastructure is required now.

## V0.5-001 authorized domain contracts

Document: trimmed non-empty id/source, verbatim non-blank text, optional string
metadata record. Chunk adds trimmed non-empty documentId and integer index >= 0.
RetrievalQuery: trimmed non-empty text and required positive integer topK with no
arbitrary application cap. RetrievalResult: ordered matches of validated Chunk and
finite score; empty matches valid. Scores have no selected direction or probability/
truth meaning. Schema validation establishes neither uniqueness nor reference/source
provenance. Metadata filtering and ranking semantics remain undefined. ADR-013 records
these choices. No retrieval execution or infrastructure is implemented here.

## V0.5-002 authorized deterministic baseline

Fixed Unicode-code-point windows default to 500 with zero overlap. Preserve exact
text, skip only whitespace-only candidates, assign emitted indexes from zero and
IDs using JSON.stringify([documentId, index]); copy source/metadata and validate
chunks. The provider/storage-neutral Retriever contract is implemented by an
in-memory lexical baseline: JavaScript lowercase, contiguous Unicode letter/number
tokens, distinct overlap count, positive matches only, descending score, input-order
ties and topK truncation. Tokenless valid queries return empty matches. Metadata
filtering is deferred. ADR-014 documents limitations; no semantic retrieval or
infrastructure is introduced. Semantic mechanics are recorded below.

## V0.5-003 authorized semantic mechanics

Separate EmbeddingProvider maps text to numeric vector; ModelProvider stays generation-only.
SemanticRetriever explicitly indexes validated chunks once in memory, embeds queries
on retrieval and ranks cosine descending with stable input-order ties and topK.
Vectors must be finite, nonempty, nonzero and dimensionally compatible. No minimum
threshold: weak or negative matches may be returned. Tests use deterministic fake
embeddings only; no adapter, live evidence or real quality claim is included.
ADR-015 records numerical validation, lifecycle and limitations. Existing retrieval
and execution boundaries remain unchanged. Context and generation boundaries are recorded below.

## V0.5-004 authorized context and generation boundary

Pure ContextAssembler uses a required positive text-only Unicode-code-point budget,
preserving whole chunks/order and stopping at the first oversized chunk. Local E1,
E2 citations retain chunk/document/source/text; scores and metadata are omitted.
Separate GroundedGenerationService owns instructions, projects evidence as data and
calls unchanged ModelProvider. Empty evidence returns insufficient_evidence without
calling; the model may also decline. Answers require non-empty text and unique
citations referencing supplied evidence. ADR-016 records structural guarantees and
limits: no semantic entailment, factual correctness or token-window claim is implied.
No agent integration or research-planning behavior change is introduced.

## V0.5-005 authorized evaluation conventions

Reusable test-only labeled scenarios exercise actual lexical and fake-embedding
semantic retrievers. Validate corpus/query and label references; use distinct IDs.
Precision@K divides distinct relevant hits in the first K positions by requested K,
even with fewer results. Recall@K divides hits by distinct relevance labels or is
null when no labels exist. Duplicates cannot inflate metrics. Assert exact fixture
orders/metrics without a production threshold or additional ranking metrics.
See [retrieval evaluation](../../concepts/retrieval-evaluation.md). This proves
fixture mechanics, not real model quality, factual truth or answer correctness.
Metadata filtering and live/statistical evaluation remain deferred.

## V0.5-006 review and mastery

[REVIEW.md](REVIEW.md) records the inspected execution model, architecture findings,
verification limits and deferred work. [MASTERY.md](MASTERY.md) provides source-linked
questions and trace exercises without claiming learner mastery. This task is review
only, not formal release closure or authorization for a subsequent capability.
No next implementation task is defined by this SPEC.

## V0.5-007 release closure

Authorized documentation-only closure records the release, synchronizes the study
guide/changelog and project status, and runs pnpm verify. No new runtime capability,
v0.6 task, deployment, publication or Git tag is included.
