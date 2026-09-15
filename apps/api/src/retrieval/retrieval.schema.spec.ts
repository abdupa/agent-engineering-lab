import {
  ChunkSchema,
  DocumentSchema,
  RetrievalQuerySchema,
  RetrievalResultSchema,
} from './retrieval.schema';

const document = { id: ' doc ', source: ' source ', text: '  Evidence\n ' };
const chunk = { ...document, id: ' chunk ', documentId: ' doc ', index: 0 };
describe('Retrieval domain contracts', () => {
  it('normalizes references while preserving original content and simple metadata', () => {
    expect(
      DocumentSchema.parse({
        ...document,
        metadata: { '': '', tag: ' raw ' },
        extra: true,
      }),
    ).toEqual({
      id: 'doc',
      source: 'source',
      text: document.text,
      metadata: { '': '', tag: ' raw ' },
    });
    expect(ChunkSchema.parse(chunk)).toEqual({
      id: 'chunk',
      documentId: 'doc',
      source: 'source',
      text: document.text,
      index: 0,
    });
  });
  it.each(['', ' \n\t '])('rejects blank text and references %#', (blank) => {
    for (const field of ['id', 'source', 'text'])
      expect(
        DocumentSchema.safeParse({ ...document, [field]: blank }).success,
      ).toBe(false);
    for (const field of ['id', 'documentId', 'source', 'text'])
      expect(ChunkSchema.safeParse({ ...chunk, [field]: blank }).success).toBe(
        false,
      );
  });
  it.each([null, 1, [], { tag: 1 }, { tag: null }])(
    'rejects non-string metadata %#',
    (metadata) => {
      expect(DocumentSchema.safeParse({ ...document, metadata }).success).toBe(
        false,
      );
      expect(ChunkSchema.safeParse({ ...chunk, metadata }).success).toBe(false);
    },
  );
  it.each([-1, 0.5, Infinity, NaN, '0', undefined])(
    'rejects invalid chunk index %#',
    (index) => {
      expect(ChunkSchema.safeParse({ ...chunk, index }).success).toBe(false);
    },
  );
  it('requires topK, trims query text and imposes no arbitrary retrieval cap', () => {
    expect(
      RetrievalQuerySchema.parse({ text: ' query ', topK: 1000000 }),
    ).toEqual({ text: 'query', topK: 1000000 });
    expect(RetrievalQuerySchema.safeParse({ text: ' ', topK: 1 }).success).toBe(
      false,
    );
  });
  it.each([undefined, 0, -1, 1.5, Infinity, NaN, '1'])(
    'rejects invalid topK %#',
    (topK) => {
      expect(
        RetrievalQuerySchema.safeParse({ text: 'query', topK }).success,
      ).toBe(false);
    },
  );
  it('accepts empty results and preserves matches without sorting or deduplicating', () => {
    expect(RetrievalResultSchema.parse({ matches: [] })).toEqual({
      matches: [],
    });
    const matches = [2, -4, 0].map((score) => ({ chunk, score }));
    const result = RetrievalResultSchema.parse({ matches });
    expect(result.matches.map((match) => match.score)).toEqual([2, -4, 0]);
    expect(result.matches[0]?.chunk.id).toBe('chunk');
  });
  it.each([Infinity, -Infinity, NaN, '1', undefined])(
    'rejects non-finite/non-numeric scores %#',
    (score) => {
      expect(
        RetrievalResultSchema.safeParse({ matches: [{ chunk, score }] })
          .success,
      ).toBe(false);
    },
  );
  it('validates chunks inside matches and requires a matches array', () => {
    expect(
      RetrievalResultSchema.safeParse({
        matches: [{ chunk: { ...chunk, text: '' }, score: 1 }],
      }).success,
    ).toBe(false);
    expect(RetrievalResultSchema.safeParse({}).success).toBe(false);
  });
});
