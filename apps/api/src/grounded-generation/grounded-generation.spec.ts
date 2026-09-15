import { zodTextFormat } from 'openai/helpers/zod';
import { ContextAssembler } from '../retrieval/context-assembler';
import type {
  ModelProvider,
  StructuredGenerationRequest,
} from '../ai/model-provider';
import {
  GroundedGenerationService,
  GroundedResponseSchema,
} from './grounded-generation.service';
const assembler = new ContextAssembler();
const retrieval = (texts: string[]) => ({
  matches: texts.map((text, index) => ({
    chunk: {
      id: `c${index}`,
      documentId: 'doc',
      source: 'source',
      index,
      text,
      metadata: { private: 'secret' },
    },
    score: 1,
  })),
});
const evidence = assembler.assemble(retrieval([' A😀 ', 'second']), 100);
function setup(response: unknown) {
  const calls: StructuredGenerationRequest<unknown>[] = [];
  const provider: ModelProvider = {
    generateStructured<T>(request: StructuredGenerationRequest<T>): Promise<T> {
      calls.push(request);
      return Promise.resolve(response as T);
    },
  };
  return { calls, service: new GroundedGenerationService(provider) };
}
describe('Context assembly and grounded generation', () => {
  it('counts code points only, preserves exact text and projects attribution', () => {
    expect(assembler.assemble(retrieval([' A😀 ', 'second']), 4)).toEqual([
      {
        citationId: 'E1',
        chunkId: 'c0',
        documentId: 'doc',
        source: 'source',
        text: ' A😀 ',
      },
    ]);
  });
  it('stops at the first oversized item rather than skipping it', () => {
    expect(assembler.assemble(retrieval(['big item', 'a']), 1)).toEqual([]);
    expect(
      assembler.assemble(retrieval(['a', 'big item', 'b']), 2),
    ).toHaveLength(1);
  });
  it('preserves order and assigns request-local IDs', () => {
    expect(evidence.map((item) => item.citationId)).toEqual(['E1', 'E2']);
    expect(evidence.map((item) => item.text)).toEqual([' A😀 ', 'second']);
    expect(assembler.assemble(retrieval([]), 1)).toEqual([]);
  });
  it.each([0, -1, 1.5, Infinity])('rejects invalid budget %s', (budget) => {
    expect(() => assembler.assemble(retrieval(['a']), budget)).toThrow(
      'Evidence budget',
    );
  });
  it('returns insufficient evidence without a provider call', async () => {
    const { service, calls } = setup(null);
    expect(await service.generate('question', [])).toEqual({
      type: 'insufficient_evidence',
    });
    expect(calls).toHaveLength(0);
  });
  it('passes only evidence data and validates cited answer', async () => {
    const { service, calls } = setup({
      result: { type: 'answer', text: ' answer ', citationIds: ['E2', 'E1'] },
    });
    expect(await service.generate(' question ', evidence)).toEqual({
      type: 'answer',
      text: 'answer',
      citationIds: ['E2', 'E1'],
    });
    expect(JSON.parse(calls[0]!.input)).toEqual({
      question: 'question',
      evidence,
    });
    expect(calls[0]!.input).not.toMatch(/score|metadata|secret/);
  });
  it('allows the model to decline available evidence', async () => {
    const { service } = setup({ result: { type: 'insufficient_evidence' } });
    expect(await service.generate('q', evidence)).toEqual({
      type: 'insufficient_evidence',
    });
  });
  it.each([[], ['E1', 'E1'], ['E3'], ['invalid']])(
    'rejects invalid citations %#',
    async (...citationIds: string[]) => {
      const { service } = setup({
        result: { type: 'answer', text: 'answer', citationIds },
      });
      await expect(service.generate('q', evidence)).rejects.toThrow(
        'Invalid grounded generation result',
      );
    },
  );
  it('rejects blank answers and ambiguous input IDs safely', async () => {
    const { service, calls } = setup({
      result: { type: 'answer', text: ' ', citationIds: ['E1'] },
    });
    await expect(service.generate('q', evidence)).rejects.toThrow(
      'Invalid grounded generation result',
    );
    await expect(
      service.generate('q', [evidence[0]!, evidence[0]!]),
    ).rejects.toThrow('Invalid grounded generation input');
    await expect(service.generate(' ', [])).rejects.toThrow(
      'Invalid grounded generation input',
    );
    expect(calls).toHaveLength(1);
  });
  it('converts the actual wrapper with the installed structured-output helper', () => {
    expect(zodTextFormat(GroundedResponseSchema, 'grounded').type).toBe(
      'json_schema',
    );
  });
});
