# Evidence context and cited output

[ContextAssembler](../../apps/api/src/retrieval/context-assembler.ts) selects whole
chunks in retrieval order within a text-only code-point budget. It stops on the
first oversized chunk. Text is unchanged; scores/metadata are omitted. E1, E2, ...
identify selected evidence locally, retaining chunk/document/source attribution.

[GroundedGenerationService](../../apps/api/src/grounded-generation/grounded-generation.service.ts)
owns instructions separately and sends the question and evidence as structured data
through ModelProvider. No evidence means deterministic insufficient_evidence without
a call. Otherwise a result is either insufficient_evidence or an answer with unique,
nonempty citations that all refer to supplied IDs. Unknown IDs are safely rejected.

The key concept is structural grounding at an application boundary. Knowing which
evidence was supplied and referenced is not proof that it supports every claim or
is true. Retrieval success is not answerability. This code-point budget excludes
question/instructions/attribution/serialization and is not a provider token limit.
No retrieval policy moves into ModelProvider and existing research planning remains
unchanged. See [ADR-016](../adr/ADR-016-context-and-grounded-generation.md).
