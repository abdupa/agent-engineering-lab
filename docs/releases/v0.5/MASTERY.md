# v0.5 Retrieval System Mastery

These questions support study; they do not claim completed learner mastery or
release closure. Use [REVIEW.md](REVIEW.md) to check the implemented model and its
limits. Source paths below are relative to apps/api/src unless stated otherwise.

| Concept                 | Implementation                                                       | Explain with an example                                                                                                 |
| ----------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Shape versus provenance | retrieval/retrieval.schema.ts                                        | Why can a valid Chunk reference a missing Document? What does metadata not mean yet?                                    |
| Text preservation       | retrieval/chunk-document.ts                                          | Why preserve whitespace inside emitted text while skipping whitespace-only windows?                                     |
| Units and boundaries    | chunkDocument and ContextAssembler                                   | How do code points differ from tokens and graphemes? Why can a valid budget still exceed a model context window?        |
| Deterministic baseline  | retrieval/lexical-retriever.ts                                       | Why do repeated tokens not increase score, and why are zero-score matches omitted?                                      |
| Capability separation   | ai/embedding-provider.ts and retrieval/retriever.ts                  | Why are embeddings separate from ModelProvider, and ranking separate from embedding generation?                         |
| Index lifecycle         | SemanticRetriever.create/retrieve                                    | Which calls embed corpus text and which embed query text? What happens for an empty corpus?                             |
| Numeric validation      | semantic-retriever.ts normalized                                     | Why reject zero vectors, and why scale before computing magnitude? Why do equal dimensions not prove compatible spaces? |
| Score interpretation    | lexical and semantic retrievers                                      | Why is overlap count 2 not comparable with cosine 0.8, and why can negative results remain in topK?                     |
| Evidence selection      | retrieval/context-assembler.ts                                       | Why stop at the next oversized chunk instead of selecting later smaller evidence?                                       |
| Structural grounding    | grounded-generation/grounded-generation.service.ts                   | Where are citation uniqueness and membership enforced? What can a correct citation still fail to prove?                 |
| Evaluation truth        | apps/api/test/retrieval-evaluation/evaluate.ts (repository-relative) | Why require unique fixture corpus IDs while tolerating duplicate relevance labels?                                      |
| Measurement scope       | metricsAtK and scenario expectations                                 | Why do precision/recall require explicit denominators and separate order assertions?                                    |

## Trace exercises

1. Chunk `ab  cd e` at two code points. Predict exact text, emitted indexes and IDs.
   Explain why concatenating emitted chunks need not reproduce omitted whitespace.
   Find the matching case in baseline.spec.ts.
2. Query `CAT cat dog dog` against `Cat cat DOG`, `cat` and `dog`. Compute scores
   and tied order. Explain what changes if topK is one and why this is not a
   probability calculation.
3. Index vectors [3,0], [1,1] and [-1,0], then query [1,0]. Compute cosine order.
   Explain why the last result is still eligible and what evidence would justify
   a threshold. Do not infer semantic understanding from these chosen vectors.
4. With evidence texts `a`, `big item`, `b` and budget two, predict the selected
   prefix and citation IDs. Explain why unused space does not permit skipping.
5. Trace empty evidence into GroundedGenerationService. Then supply evidence and
   a model answer citing an unknown ID. Identify the no-call path and safe rejection.
   Explain why a known ID with an unsupported assertion can still pass structure.
6. For returned IDs [a,a,b,c], relevance labels [a,a,b,c] and K=3, calculate
   Precision@3 and Recall@3. Both are 2/3: truncate positions before deduplication.
   For two relevant returns and K=5, explain precision 0.4. With no labels, explain
   precision zero and recall null without inventing a default recall value.
7. Compare the shared `car` lexical/fake-semantic fixtures. State exactly what the
   different outcomes prove, and list the real-model evidence missing from them.
8. Trace dependencies from generation to ModelProvider and semantic retrieval to
   EmbeddingProvider. Explain why neither path invokes ToolExecutor or an agent,
   and why the conceptual SPEC diagram does not prove deployed HTTP integration.
9. Propose evidence needed before changing chunking, adding a real embedding
   provider, choosing a threshold or adding vector storage. Classify decisions
   under DECISION_POLICY without implementing future capabilities as an exercise.

A satisfactory answer names the owning component, predicts an observable result,
and states the limit of the evidence. Distinguish retrieval from memory, retrieval
from generation, selected evidence from truth, citation integrity from entailment,
fixture labels from universal relevance, and a review from a formal release.
