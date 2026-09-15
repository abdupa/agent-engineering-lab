# Labeled retrieval evaluation

The reusable test-only evaluator and fixtures live in apps/api/test/retrieval-evaluation.
Scenarios supply schema-validated chunks/query, fixture relevance labels, optional
exact result order and expected metrics. Corpus IDs must be unique and labels must
reference present chunks. Duplicate labels are allowed but count only once. The
actual LexicalRetriever and SemanticRetriever run; semantic vectors are fake.

Laboratory conventions:

- Precision@K = distinct relevant chunk IDs in the first K result positions / K.
  K is requested topK even when fewer results are returned: two relevant results
  with K=5 give 0.4, not 1.
- Recall@K = those same distinct hits / distinct labeled relevant chunk IDs.
  With no relevance labels it is null, never silently zero or one. Precision is
  still zero in that case.
- Duplicate returned IDs cannot inflate hits. Positions are truncated before
  deduplication. Both metrics stay within [0,1] when defined.

Six lexical fixtures cover exact match, partial retrieval, multiple relevant chunks,
stable ties, topK truncation, missing evidence and no labels. Four fake-semantic
fixtures cover controlled ranking, stable ties, zero useful hits despite returned
matches and null recall with returned results. A shared car query retrieves no
lexical match but ranks the fixture-labeled automobile first with scripted vectors.
This is controlled evaluator/retriever mechanics, not semantic superiority.

Exact order and expected metric values are asserted; there is no aggregate quality
threshold. Precision/recall do not fully measure ranking quality. No MRR, MAP, NDCG,
statistical benchmark, live model, judge or generation/citation quality evaluation
is included. Filtering tests remain deferred because filtering is not implemented.

The key concept is explicit relevance labels and metric denominators, separate from
retriever score scales and generation correctness. Labels are truth only for their
fixtures. Passing establishes deterministic retrieval behavior on these cases, not
production quality, real embedding understanding, factual correctness or universal
superiority. Production interfaces and behavior remain unchanged.

## Implementation decisions

L1: keep scenario data, a shared evaluator and metric checks under test/ rather than
introducing a production evaluation service or framework. This follows the existing
agent-evaluation convention and keeps runtime behavior unchanged. Require unique
corpus IDs within fixtures to make relevance labels unambiguous; this is an evaluator
assumption, not an added retrieval-domain restriction. Duplicate relevance labels
and returned IDs are still handled by distinct-ID metric calculations.
