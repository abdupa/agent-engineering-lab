# ADR-014 — Fixed chunk windows and lexical baseline

Status: Accepted

## Decision

chunkDocument validates a Document and uses Array.from(text) to form fixed Unicode
code-point windows, default 500, configurable positive safe integer size. Overlap
is always zero. Skip only whitespace-only candidate windows; preserve emitted text
verbatim. Index emitted chunks sequentially from zero. IDs use the stable convention
JSON.stringify([normalizedDocumentId, emittedIndex]), avoiding delimiter ambiguity.
Copy source/metadata and validate each output using ChunkSchema. This convention is
not a content hash: changing document text or window size may change what an ID refers
to. Document identity uniqueness remains a caller responsibility.

Retriever defines retrieve(RetrievalQuery): Promise<RetrievalResult> independently
of providers, storage and agents. LexicalRetriever holds a schema-parsed copy of
supplied chunks. It validates queries and results; invalid input uses existing Zod
validation errors. No error framework, application service or startup wiring added.
Results are parsed copies so caller mutation cannot alter the retained corpus.

Tokenization uses JavaScript String.toLowerCase (not locale-specific conversion),
then contiguous Unicode letter/number sequences via /[\p{L}\p{N}]+/gu. Distinct sets
score the count of shared tokens. Repetition adds nothing. Zero-score chunks are
excluded, scores descend and ties preserve supplied order explicitly. topK truncates
without requiring that many matches. Tokenless valid queries and no overlap return
empty matches. Metadata is preserved but never filtered or scored.

## Tradeoffs and limitations

Code-point windows are not word, sentence, token or grapheme aware. Boundaries may
split words or user-perceived characters; zero overlap can divide relevant context.
This intentionally simple baseline is not a recommended final chunking strategy.
Runtime Unicode casing/properties apply without normalization, stemming, lemmatization,
stopwords, synonyms, fuzzy matching or locale-specific NLP. Scores are non-negative
integer overlap counts only; they are not confidence, probability, factual correctness
or a universal relevance scale comparable to future semantic/BM25/reranker scores.

The implementation scans/tokenizes the corpus per query and sorts matches in memory.
No performance/semantic-quality claim is made. A straightforward baseline earns
future complexity through evidence. No embeddings, vectors, BM25, hybrid retrieval,
reranking, persistence, model calls, context assembly, grounded generation, agent
integration or memory is added. Existing domain and execution boundaries are unchanged.
