# ADR-016 — Evidence assembly and structural citation validation

Status: Accepted

## Decision

ContextAssembler is pure and validates RetrievalResult. A required positive safe
integer budget counts Unicode code points in chunk text only. Preserve order and
whole text verbatim. Stop at the first chunk exceeding remaining space, never skip
it to choose a smaller lower-ranked chunk. Empty evidence is valid. IDs E1, E2, ...
are deterministic request-local labels, not persistent identities. Evidence retains
citationId, chunkId, documentId, source and text, omitting scores and metadata.

GroundedGenerationService owns fixed application instructions and accepts question
plus assembled evidence, independently of retrieval and assembly. It validates and
projects input, rejects ambiguous duplicate evidence IDs, and sends JSON data through
ModelProvider. Empty evidence returns insufficient_evidence without generation.
The model can also decline available but inadequate evidence. ResearchPlanService
and all existing provider/tool/agent/orchestration contracts remain unchanged.

GroundedResult is answer with trimmed non-empty text and one or more citationIds,
or insufficient_evidence. A root result wrapper follows the existing structured
output convention. The service validates returned structure, citation uniqueness
and membership in the supplied evidence set. Local failures use fixed safe input/
result Error messages, without causes; existing provider errors propagate unchanged.
Citation membership is request-dependent application validation, not provider policy.
No SDK is imported in production application code; installed-helper conversion is
verified offline in tests. No live compatibility or answer-quality claim is made.

## Guarantees and limitations

The service establishes which evidence was supplied, structural citation references,
no-evidence call avoidance and separation of retrieval/assembly/generation. It cannot
prove claim support, factual evidence correctness, absence of unsupported assertions
or semantic citation sufficiency. Evidence text is data, not application instructions;
the prompt expresses that boundary without claiming injection-proof behavior.

Budget excludes labels, IDs, serialization, question and instructions. It is NOT a
model token budget or guarantee of provider context-window compatibility. References
and source content remain trusted caller data, not authenticated provenance.

No entailment checking, LLM judge, citation-quality scoring, hallucination detection,
real embedding adapter, vectors, reranking/hybrid/filtering/web search, agent integration,
memory or UI is added. No new dependency, HTTP wiring or automatic retrieval invocation.
