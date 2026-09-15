import { chunkDocument } from './chunk-document';
import { LexicalRetriever } from './lexical-retriever';
const document = {
  id: 'doc',
  source: 'source',
  text: 'text',
  metadata: { tag: 'raw' },
};
describe('Fixed chunking and lexical retrieval', () => {
  it('uses 500 code points by default and preserves exact Unicode content', () => {
    const text = '😀'.repeat(501);
    const chunks = chunkDocument({ ...document, text });
    expect(chunks.map((chunk) => Array.from(chunk.text).length)).toEqual([
      500, 1,
    ]);
    expect(chunks.map((chunk) => chunk.text).join('')).toBe(text);
  });
  it('skips whitespace windows and numbers emitted chunks sequentially', () => {
    const chunks = chunkDocument({ ...document, text: 'ab  cd e' }, 2);
    expect(chunks.map(({ text, index, id }) => ({ text, index, id }))).toEqual([
      { text: 'ab', index: 0, id: '["doc",0]' },
      { text: 'cd', index: 1, id: '["doc",1]' },
      { text: ' e', index: 2, id: '["doc",2]' },
    ]);
    expect(chunks[0]).toMatchObject({
      documentId: 'doc',
      source: 'source',
      metadata: { tag: 'raw' },
    });
    expect(chunkDocument({ ...document, text: 'ab  cd e' }, 2)).toEqual(chunks);
  });
  it('copies metadata and makes IDs unambiguous for delimiter-containing document IDs', () => {
    const chunks = chunkDocument({ ...document, id: 'a",0]', text: 'ab' }, 1);
    expect(JSON.parse(chunks[0]!.id)).toEqual(['a",0]', 0]);
    chunks[0]!.metadata!.tag = 'changed';
    expect(chunks[1]!.metadata!.tag).toBe('raw');
    expect(document.metadata.tag).toBe('raw');
  });
  it.each([0, -1, 1.5, Infinity, NaN])(
    'rejects invalid chunk size %s',
    (size) => {
      expect(() => chunkDocument(document, size)).toThrow(
        'Chunk size must be a positive safe integer',
      );
    },
  );
  it('rejects invalid documents', () => {
    expect(() => chunkDocument({ ...document, text: ' ' })).toThrow();
  });
  const corpus = () =>
    ['Cat cat DOG', 'cat', 'dog', 'ÉCOLE 123', 'unrelated'].map(
      (text, index) => ({
        ...document,
        documentId: 'doc',
        id: String(index),
        index,
        text,
      }),
    );
  it('scores distinct overlap, orders descending and preserves tied input order', async () => {
    const result = await new LexicalRetriever(corpus()).retrieve({
      text: 'CAT cat dog dog',
      topK: 3,
    });
    expect(result.matches.map(({ chunk, score }) => [chunk.id, score])).toEqual(
      [
        ['0', 2],
        ['1', 1],
        ['2', 1],
      ],
    );
  });
  it('tokenizes Unicode letters/numbers after runtime lowercasing', async () => {
    const result = await new LexicalRetriever(corpus()).retrieve({
      text: 'école---123',
      topK: 10,
    });
    expect(result.matches.map(({ chunk, score }) => [chunk.id, score])).toEqual(
      [['3', 2]],
    );
  });
  it.each(['!!! 😀', 'missing'])(
    'returns empty matches for %s',
    async (text) => {
      expect(
        await new LexicalRetriever(corpus()).retrieve({ text, topK: 10 }),
      ).toEqual({ matches: [] });
    },
  );
  it('supports empty corpus and topK truncation', async () => {
    expect(
      await new LexicalRetriever([]).retrieve({ text: 'cat', topK: 1 }),
    ).toEqual({ matches: [] });
    expect(
      (
        await new LexicalRetriever(corpus()).retrieve({
          text: 'cat dog',
          topK: 1,
        })
      ).matches,
    ).toHaveLength(1);
  });
  it('isolates the corpus from caller and result mutations', async () => {
    const chunks = corpus();
    const retriever = new LexicalRetriever(chunks);
    chunks[0]!.text = 'changed';
    const first = await retriever.retrieve({ text: 'cat dog', topK: 1 });
    first.matches[0]!.chunk.text = 'changed';
    expect(
      (await retriever.retrieve({ text: 'cat dog', topK: 1 })).matches[0]!.chunk
        .text,
    ).toBe('Cat cat DOG');
  });
  it('validates supplied chunks and query', () => {
    expect(
      () => new LexicalRetriever([{ ...corpus()[0]!, index: -1 }]),
    ).toThrow();
    expect(() =>
      new LexicalRetriever([]).retrieve({ text: 'cat', topK: 0 }),
    ).toThrow();
  });
});
