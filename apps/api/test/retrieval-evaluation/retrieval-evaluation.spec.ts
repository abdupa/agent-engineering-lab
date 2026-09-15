import { LexicalRetriever } from '../../src/retrieval/lexical-retriever';
import { SemanticRetriever } from '../../src/retrieval/semantic-retriever';
import { evaluateScenario, metricsAtK } from './evaluate';
import { fakeVectors, lexicalScenarios, semanticScenarios } from './scenarios';

describe('Labeled deterministic retrieval evaluation', () => {
  it.each(lexicalScenarios)('lexical: $name', async (scenario) => {
    await evaluateScenario(scenario, (corpus) => new LexicalRetriever(corpus));
  });
  it.each(semanticScenarios)('fake semantic: $name', async (scenario) => {
    await evaluateScenario(scenario, (corpus) =>
      SemanticRetriever.create(corpus, {
        embed: (text) => {
          const vector = fakeVectors[text];
          if (!vector) throw new Error('Missing fixture vector');
          return Promise.resolve(vector);
        },
      }),
    );
  });
  it('counts distinct hits only within the first K positions', () => {
    expect(metricsAtK(['a', 'a', 'b', 'c'], ['a', 'a', 'b', 'c'], 3)).toEqual({
      precision: 2 / 3,
      recall: 2 / 3,
    });
    expect(metricsAtK(['a', 'b'], ['a', 'b'], 5)).toEqual({
      precision: 0.4,
      recall: 1,
    });
    expect(metricsAtK(['a'], [], 5)).toEqual({ precision: 0, recall: null });
  });
  it('rejects missing corpus references and ambiguous duplicate corpus IDs before retrieval', async () => {
    const create = jest.fn();
    const scenario = lexicalScenarios[0]!;
    await expect(
      evaluateScenario({ ...scenario, relevantIds: ['missing'] }, create),
    ).rejects.toThrow('Invalid evaluation');
    await expect(
      evaluateScenario(
        { ...scenario, corpus: [scenario.corpus[0]!, scenario.corpus[0]!] },
        create,
      ),
    ).rejects.toThrow('Invalid evaluation');
    expect(create).not.toHaveBeenCalled();
  });
  it('validates corpus and query before constructing a retriever', async () => {
    const create = jest.fn();
    const scenario = lexicalScenarios[0]!;
    await expect(
      evaluateScenario(
        { ...scenario, corpus: [{ ...scenario.corpus[0]!, text: '   ' }] },
        create,
      ),
    ).rejects.toThrow();
    await expect(
      evaluateScenario(
        { ...scenario, query: { text: 'apple', topK: 0 } },
        create,
      ),
    ).rejects.toThrow();
    expect(create).not.toHaveBeenCalled();
  });
  it.each([0, -1, 1.5, Infinity])('rejects invalid metric K %s', (k) => {
    expect(() => metricsAtK([], [], k)).toThrow('Invalid evaluation K');
  });
});
