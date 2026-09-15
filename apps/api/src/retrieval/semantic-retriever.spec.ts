import { SemanticRetriever } from './semantic-retriever';
import { LexicalRetriever } from './lexical-retriever';
const chunks = ['car', 'automobile', 'opposite'].map((text, index) => ({
  id: String(index),
  documentId: 'doc',
  source: 'source',
  text,
  index,
}));
describe('Semantic retrieval mechanics with fake embeddings', () => {
  it('indexes once and embeds each query, with controlled ranking different from lexical', async () => {
    const embed = jest.fn((text: string) =>
      Promise.resolve(
        text === 'car' ? [1, 1] : text === 'opposite' ? [-1, 0] : [3, 0],
      ),
    );
    const retriever = await SemanticRetriever.create(chunks, { embed });
    expect(embed.mock.calls).toEqual([['car'], ['automobile'], ['opposite']]);
    const result = await retriever.retrieve({ text: 'car query', topK: 3 });
    expect(result.matches.map((match) => match.chunk.id)).toEqual([
      '1',
      '0',
      '2',
    ]);
    expect(result.matches[0]!.score).toBe(1);
    expect(result.matches[2]!.score).toBe(-1);
    await retriever.retrieve({ text: 'car query', topK: 1 });
    expect(embed).toHaveBeenCalledTimes(5);
    expect(
      (
        await new LexicalRetriever(chunks).retrieve({
          text: 'car query',
          topK: 1,
        })
      ).matches[0]!.chunk.id,
    ).toBe('0');
  });
  it('preserves exact ties and truncates topK', async () => {
    const retriever = await SemanticRetriever.create(chunks, {
      embed: () => Promise.resolve([2, 0]),
    });
    expect(
      (await retriever.retrieve({ text: 'q', topK: 2 })).matches.map(
        (match) => match.chunk.id,
      ),
    ).toEqual(['0', '1']);
  });
  it('handles empty corpus while embedding each valid query', async () => {
    const embed = jest.fn(() => Promise.resolve([1]));
    const retriever = await SemanticRetriever.create([], { embed });
    expect(embed).not.toHaveBeenCalled();
    expect(await retriever.retrieve({ text: 'q', topK: 3 })).toEqual({
      matches: [],
    });
    expect(embed).toHaveBeenCalledTimes(1);
  });
  it.each(
    [
      [],
      [0, 0],
      [NaN],
      [Infinity],
      [-Infinity],
      ['1'],
      new Array<number>(2),
      null,
    ].map((vector) => ({ vector })),
  )('rejects malformed corpus vectors safely %#', async ({ vector }) => {
    await expect(
      SemanticRetriever.create(chunks, {
        embed: () => Promise.resolve(vector as number[]),
      }),
    ).rejects.toThrow('Invalid embedding vector');
  });
  it('rejects corpus dimension mismatch', async () => {
    const embed = jest
      .fn()
      .mockResolvedValueOnce([1])
      .mockResolvedValue([1, 2]);
    await expect(SemanticRetriever.create(chunks, { embed })).rejects.toThrow(
      'Invalid embedding vector',
    );
  });
  it.each([[], [0, 0], [1], [NaN, 1]].map((vector) => ({ vector })))(
    'rejects invalid query vectors %#',
    async ({ vector }) => {
      const embed = jest
        .fn()
        .mockResolvedValueOnce([1, 0])
        .mockResolvedValue(vector);
      const retriever = await SemanticRetriever.create(chunks.slice(0, 1), {
        embed,
      });
      await expect(retriever.retrieve({ text: 'q', topK: 1 })).rejects.toThrow(
        'Invalid embedding vector',
      );
    },
  );
  it.each([Number.MAX_VALUE, Number.MIN_VALUE])(
    'normalizes extreme nonzero magnitudes %s without overflow/underflow',
    async (value) => {
      const retriever = await SemanticRetriever.create(chunks, {
        embed: () => Promise.resolve([value, value]),
      });
      expect(
        (await retriever.retrieve({ text: 'q', topK: 1 })).matches[0]!.score,
      ).toBeCloseTo(1);
    },
  );
  it('discards raw provider errors', async () => {
    await expect(
      SemanticRetriever.create(chunks, {
        embed: () => Promise.reject(new Error('private')),
      }),
    ).rejects.toThrow(new Error('Embedding generation failed'));
  });
  it('isolates indexed vectors/chunks and returned results from mutation', async () => {
    const vector = [1, 0];
    const corpus = chunks.map((chunk) => ({ ...chunk }));
    const retriever = await SemanticRetriever.create(corpus, {
      embed: () => Promise.resolve(vector),
    });
    corpus[0]!.text = 'changed';
    vector[0] = -1;
    const result = await retriever.retrieve({ text: 'q', topK: 1 });
    expect(result.matches[0]!.score).toBe(-1);
    expect(result.matches[0]!.chunk.text).toBe('car');
    result.matches[0]!.chunk.text = 'changed';
    expect(
      (await retriever.retrieve({ text: 'q', topK: 1 })).matches[0]!.chunk.text,
    ).toBe('car');
  });
});
