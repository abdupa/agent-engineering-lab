# v0.5 Retrieval System Review

V0.5-006 reviews the implemented retrieval foundation and its evidence. This is
not formal release closure, a live quality benchmark or certification of mastery.
No clear runtime defect or architecture violation requiring correction was found.

## Execution model and dependency direction

```text
Explicit caller -> chunkDocument(Document) -> validated chunks
Explicit caller -> LexicalRetriever(chunks)
                or SemanticRetriever.create(chunks, EmbeddingProvider)
                -> retrieve(query) -> validated ordered RetrievalResult
Explicit caller -> ContextAssembler.assemble(result, evidenceBudget) -> evidence
Explicit caller -> GroundedGenerationService.generate(question, evidence)
                -> ModelProvider -> validated structure + citation membership
```

These are independently composed components, not a wired HTTP pipeline or agent
tool. AppModule still composes the research application. The SPEC's RetrievalService
is conceptual; no extra service is implemented or needed to demonstrate these
boundaries. Retrieval and context assembly never move into ModelProvider.
EmbeddingProvider is embedding-only; ModelProvider remains generation-only.
ToolExecutor, AgentState and orchestration have no retrieval integration.

Documents/chunks preserve non-blank text verbatim and normalize reference strings.
Schemas validate shape, not ID uniqueness, parent existence, source authenticity or
metadata meaning. chunkDocument uses fixed Unicode-code-point windows, default 500,
zero overlap, skipping only whitespace-only windows. Emitted indexes are sequential;
JSON.stringify([documentId, index]) avoids delimiter ambiguity but is not immutable
content identity. Changed text or window size can change what an ID refers to.

Lexical retrieval lowercases and extracts distinct Unicode letter/number tokens.
It ranks positive overlap counts descending with supplied-order ties. Semantic
initialization validates chunks and embeds the corpus once; each query is embedded
at retrieval time. Finite, nonempty, nonzero vectors must have compatible dimensions.
Scaling before normalization avoids numerical overflow/underflow for extreme finite
magnitudes. Unit-vector dot products produce cosine scores, clamped for rounding
and ranked descending with stable ties. Equal dimensions cannot prove a consistent
embedding space. No threshold excludes weak, zero or negative semantic matches.

Context assembly takes a prefix of whole chunks within a text-only code-point
budget, stopping at the first oversized chunk. It neither truncates nor searches
later smaller chunks. E1/E2 references are request-local. Evidence projects exact
text and chunk/document/source attribution, omitting scores and arbitrary metadata.
The budget excludes instructions, question, labels and serialization; it is not a
token budget or a provider context-window guarantee.

GroundedGenerationService owns instructions and input projection. Valid input with
empty evidence returns insufficient_evidence without a model call. With evidence,
the model may still decline. The root result wrapper follows the existing provider
transport convention. Answers require nonempty text and unique citations belonging
to the supplied evidence set. The standalone result schema checks structure;
request-dependent citation uniqueness/membership is enforced by the service.
Provider failures propagate; local input/result failures use fixed safe messages.

## Architecture findings

| Concern                    | Finding and disposition                                                                                                                                                                                                                                                                                                             |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Premature abstractions     | Retriever provides a real seam for two implementations; EmbeddingProvider separates a distinct capability. No generic index, storage repository or orchestration layer is justified.                                                                                                                                                |
| Validation duplication     | Corpus/query/result parsing protects different entry points and creates owned copies. Assembly and generation validate independently callable boundaries. Generation rechecks structure alongside request-dependent citation checks; this is explicit defense at the service boundary, not a reason for a new validation framework. |
| Coupling                   | Zod is intentional shared schema coupling. Grounded generation imports Evidence from context-assembler; that is small shared data coupling, with no retrieval-policy or provider-SDK dependency. Extracting another schema module solely for style is unnecessary.                                                                  |
| Responsibilities           | Chunking, ranking, evidence selection and generation remain distinct. Scores stay out of model evidence. Tool/agent contracts remain unchanged.                                                                                                                                                                                     |
| Dependencies and dead code | No new external service/framework is needed. Direct construction and test-only consumers are intentional. The evaluator is excluded from production build; no dead abstraction requiring removal was identified in this path.                                                                                                       |
| Resource costs             | Lexical retrieval rescans/tokenizes the corpus per query; semantic retrieval scans vectors and sorts in memory. Repeated parsing/copying and Array.from allocations cost time/memory. No measurements justify optimization or a vector database yet.                                                                                |
| Error boundary             | Internal chunk/query validation can expose Zod errors; there is no new public HTTP mapping. Embedding and local generation failures discard raw causes. A future external entry point must establish its own safe transport boundary.                                                                                               |

Existing decisions remain in [ADR-013](../../adr/ADR-013-retrieval-domain-contracts.md),
[ADR-014](../../adr/ADR-014-deterministic-retrieval-baseline.md),
[ADR-015](../../adr/ADR-015-semantic-retrieval-foundation.md) and
[ADR-016](../../adr/ADR-016-context-and-grounded-generation.md). No architecture
change or new ADR is required by this review. Corrected stale milestone-status
wording in the SPEC and retrieval concepts without changing their policies.

## Evaluation and verification evidence

The repository suite contains 468 deterministic tests in 25 suites. The v0.5
contribution is 98 tests across five suites: domain contracts, chunking/lexical
baseline, semantic mechanics, assembly/generation and labeled retrieval evaluation.
The evaluation suite contributes 17 tests, including ten labeled scenarios.

Tests cover text preservation and invalid contracts, Unicode windows/tokenization,
copy isolation, score/tie/topK behavior, vector lifecycle and invalid dimensions,
extreme magnitudes, empty corpora, evidence budgets, no-evidence call avoidance,
invalid/duplicate citations and offline installed structured-output conversion.
Six lexical and four fake-semantic fixtures assert exact orders and metrics.
Metrics slice the first K positions before deduplicating returned IDs. Precision@K
uses requested K even with fewer results; Recall@K uses distinct fixture labels and
is null when none exist. Corpus IDs must be unique within evaluation fixtures, not
as a new production contract. Labels are truth only for their fixture.

These tests do not exercise a live embedding adapter, a full deployed retrieval
endpoint or answer entailment. Fake vectors establish mechanics, not real synonym
understanding or semantic superiority. Precision/recall do not completely measure
ranking quality; exact ordering is separately asserted. No production acceptance
threshold, MRR/MAP/NDCG, repeated-run statistics or latency/cost benchmark is claimed.
The historical v0.1 live research smoke is not live retrieval/generation evidence.

`pnpm verify` passed formatting, lint, typecheck, all 468 tests in 25 suites, build
and diff checks for this review. HTTP regressions used localhost sockets. Local
review/mastery links resolve. No live AI request was made.

## Limitations and deliberately deferred work

Code-point windows can split words and graphemes; zero overlap can split useful
context. The lexical baseline lacks stemming, synonyms, normalization and fuzzy
matching. Semantic vectors have no real adapter, timeout/retry policy, persistence
or quality-calibrated threshold. A provider that never resolves can stall indexing
or retrieval; an eventual real integration needs explicit reliability requirements.

Retrieval success does not imply answerability. Citation membership does not prove
claim support, factual accuracy, complete citation coverage or absence of unsupported
claims. Treating text as evidence/data expresses prompt ownership but is not proof
of prompt-injection immunity. Schemas do not authenticate provenance or redact all
secrets in source text. There is no end-to-end production quality guarantee.

Metadata filtering, real-model evaluation, vector databases, hybrid/BM25 retrieval,
reranking, live providers, claim checking, judges, agent integration, persistence
and memory remain deferred. Vector search is useful only when a requirement and
quality evidence warrant representation-based comparison; deterministic lexical
search remains a valid baseline. Neither is universally superior.

## Autonomous decision and learning

L1: use release-local REVIEW and MASTERY documents, following v0.4, rather than
synchronizing the canonical study guide before release closure. Retain runtime code
because the review identified limits to document, not a demonstrated defect to fix.
No L2/L3 architecture decision was needed. The key concept is separating retrieval,
evidence selection, structural citation integrity and semantic correctness, with
different evidence required for each. Continue with [MASTERY.md](MASTERY.md).
