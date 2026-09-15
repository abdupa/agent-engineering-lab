# v0.5 — Retrieval Engineering

Status: Released in the repository, 2026-09-15.

V0.5-007 closes this release and synchronizes the canonical study guide. This is
not deployment, package publication or a Git tag. No v0.6 implementation is started.

## Delivered scope

| Milestone | Delivered                                                                           |
| --------- | ----------------------------------------------------------------------------------- |
| V0.5-001  | Validated Document, Chunk, RetrievalQuery and ordered RetrievalResult contracts     |
| V0.5-002  | Fixed code-point chunking and deterministic lexical retrieval                       |
| V0.5-003  | Separate EmbeddingProvider and in-memory cosine retrieval with fake-vector evidence |
| V0.5-004  | Whole-chunk evidence assembly and structured generation with citation checks        |
| V0.5-005  | Reusable labeled retrieval fixtures with explicit Precision@K and Recall@K          |
| V0.5-006  | Architecture review and implementation-linked mastery exercises                     |

```text
Explicit caller -> chunkDocument -> validated chunks
                -> LexicalRetriever or SemanticRetriever (EmbeddingProvider)
                -> RetrievalResult -> ContextAssembler -> evidence
                -> GroundedGenerationService -> ModelProvider
```

These are separately composed capabilities, not a wired retrieval HTTP endpoint or
agent integration. ModelProvider remains generation-only; EmbeddingProvider is
embedding-only. ToolExecutor, AgentState, orchestration and research planning are
unchanged. No real embedding adapter is included.

Chunking defaults to 500 Unicode code points with zero overlap, preserves emitted
text verbatim and skips whitespace-only windows. Lexical scores count distinct
shared tokens. Semantic indexes embed corpus chunks once and queries on retrieval;
validated nonzero vectors are normalized for cosine ranking. Both preserve supplied
order on exact ties and return at most topK. Semantic retrieval has no minimum
threshold and can return weak or negative matches.

Assembly preserves ranked order and whole text, stopping at the first chunk that
exceeds the remaining text-only code-point budget. Request-local E1/E2 references
retain attribution without scores or arbitrary metadata. Grounded generation
returns insufficient_evidence without a call when evidence is empty; otherwise the
model may answer or decline. Answers require unique citations to supplied evidence.

Decisions are recorded in ADR-013 through ADR-016. [REVIEW](REVIEW.md) found no clear
runtime defect requiring correction; [MASTERY](MASTERY.md) provides learning exercises
without asserting learner mastery.

## Verification

Release validation: `pnpm verify` passed formatting checks, lint, typecheck,
**468 deterministic tests in 25 suites**, build and git diff checks. This includes
98 v0.5 tests across five suites. HTTP regressions use localhost sockets. No live
model or embedding request was made. The earlier v0.1 research smoke is separate
historical evidence, not live retrieval or grounded-answer verification.

Ten labeled scenarios exercise the actual lexical and semantic retrievers with fake
embeddings. Precision@K divides distinct relevant hits in the first K positions by
requested K, including unfilled positions. Recall@K divides by distinct labeled
relevant IDs and is null without labels. Duplicate IDs cannot inflate metrics;
exact fixture order is checked separately. Labels are truth for their fixture only.
Offline structured-output conversion checks establish helper compatibility, not
live acceptance or answer quality.

## Limits and deferred capabilities

Schemas do not authenticate provenance, ensure cross-document identity or establish
factual correctness. Code-point windows can split words/graphemes; code-point
budgets are not provider token limits. Citation membership does not prove claim
support, complete grounding or prompt-injection resistance. Fake vectors establish
mechanics, not real semantic understanding or superiority over lexical retrieval.

No production relevance threshold, live quality evaluation, statistical benchmark,
real embedding integration/reliability, filtering, hybrid/BM25 retrieval, reranking,
vector database, persistence, agent integration or memory is delivered. In-memory
scans and copies have no measured production performance guarantee. A future real
embedding adapter needs explicit timeout and failure-policy requirements.

The [study guide](../../study-guide/STUDY_GUIDE.md) now includes the v0.5 curriculum.
No next implementation task is defined. Future roadmap topics require separate scope.
