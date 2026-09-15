import {
  ResearchPlanSchema,
  ResearchQuestionSchema,
  RequiredEvidenceSchema,
} from './research-plan.schema';
import type { ResearchPlan } from './research-plan.schema';

const validPlan = {
  objective: 'Compare database options',
  researchQuestions: [
    {
      id: 'q1',
      question: 'How is tenant isolation supported?',
      rationale: 'Multi-tenancy is required',
    },
  ],
  assumptions: ['A small team operates the platform'],
  requiredEvidence: [
    { topic: 'Tenant isolation', reason: 'Assess separation guarantees' },
  ],
  unknowns: ['Expected workload size'],
} satisfies ResearchPlan;

describe('research plan contract', () => {
  it('parses unknown data into a ResearchPlan', () => {
    const input: unknown = validPlan;
    const plan: ResearchPlan = ResearchPlanSchema.parse(input);
    expect(plan).toEqual(validPlan);
    expect(
      ResearchQuestionSchema.parse(validPlan.researchQuestions[0]),
    ).toEqual(validPlan.researchQuestions[0]);
    expect(RequiredEvidenceSchema.parse(validPlan.requiredEvidence[0])).toEqual(
      validPlan.requiredEvidence[0],
    );
  });

  it('allows empty arrays without inventing minimum item counts', () => {
    const input = {
      objective: 'Explore options',
      researchQuestions: [],
      assumptions: [],
      requiredEvidence: [],
      unknowns: [],
    };
    expect(ResearchPlanSchema.parse(input)).toEqual(input);
  });

  it('trims strings in the parsed output', () => {
    expect(
      ResearchPlanSchema.parse({
        ...validPlan,
        objective: '  Compare options  ',
        assumptions: [' Small team '],
      }),
    ).toMatchObject({
      objective: 'Compare options',
      assumptions: ['Small team'],
    });
  });

  it('strips unknown object keys at the root and nested boundaries', () => {
    const input = {
      ...validPlan,
      extra: true,
      researchQuestions: [{ ...validPlan.researchQuestions[0], extra: true }],
      requiredEvidence: [{ ...validPlan.requiredEvidence[0], extra: true }],
    };
    expect(ResearchPlanSchema.parse(input)).toEqual(validPlan);
  });

  it.each([
    ['objective'],
    ['researchQuestions'],
    ['assumptions'],
    ['requiredEvidence'],
    ['unknowns'],
  ])('requires %s', (field) => {
    const input: Record<string, unknown> = { ...validPlan };
    delete input[field];
    const result = ResearchPlanSchema.safeParse(input);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.path).toEqual([field]);
  });

  it.each([
    {
      name: 'incorrect primitive',
      patch: { objective: 42 },
      path: ['objective'],
    },
    {
      name: 'missing question rationale',
      patch: { researchQuestions: [{ id: 'q1', question: 'Why?' }] },
      path: ['researchQuestions', 0, 'rationale'],
    },
    {
      name: 'incorrect evidence reason',
      patch: { requiredEvidence: [{ topic: 'Isolation', reason: false }] },
      path: ['requiredEvidence', 0, 'reason'],
    },
    {
      name: 'non-object question',
      patch: { researchQuestions: ['question'] },
      path: ['researchQuestions', 0],
    },
    {
      name: 'non-object evidence',
      patch: { requiredEvidence: [null] },
      path: ['requiredEvidence', 0],
    },
    {
      name: 'non-array questions',
      patch: { researchQuestions: {} },
      path: ['researchQuestions'],
    },
    {
      name: 'non-array evidence',
      patch: { requiredEvidence: {} },
      path: ['requiredEvidence'],
    },
    {
      name: 'non-array assumptions',
      patch: { assumptions: 'none' },
      path: ['assumptions'],
    },
    {
      name: 'non-array unknowns',
      patch: { unknowns: null },
      path: ['unknowns'],
    },
    {
      name: 'incorrect assumption item',
      patch: { assumptions: [42] },
      path: ['assumptions', 0],
    },
    { name: 'empty objective', patch: { objective: '' }, path: ['objective'] },
    {
      name: 'blank question ID',
      patch: {
        researchQuestions: [{ ...validPlan.researchQuestions[0], id: '  ' }],
      },
      path: ['researchQuestions', 0, 'id'],
    },
    {
      name: 'empty question',
      patch: {
        researchQuestions: [
          { ...validPlan.researchQuestions[0], question: '' },
        ],
      },
      path: ['researchQuestions', 0, 'question'],
    },
    {
      name: 'empty rationale',
      patch: {
        researchQuestions: [
          { ...validPlan.researchQuestions[0], rationale: '' },
        ],
      },
      path: ['researchQuestions', 0, 'rationale'],
    },
    {
      name: 'empty evidence topic',
      patch: {
        requiredEvidence: [{ ...validPlan.requiredEvidence[0], topic: '' }],
      },
      path: ['requiredEvidence', 0, 'topic'],
    },
    {
      name: 'empty evidence reason',
      patch: {
        requiredEvidence: [{ ...validPlan.requiredEvidence[0], reason: '' }],
      },
      path: ['requiredEvidence', 0, 'reason'],
    },
    {
      name: 'empty assumption',
      patch: { assumptions: [''] },
      path: ['assumptions', 0],
    },
    {
      name: 'blank unknown',
      patch: { unknowns: ['\t\n'] },
      path: ['unknowns', 0],
    },
  ])('rejects $name', ({ patch, path }) => {
    const result = ResearchPlanSchema.safeParse({ ...validPlan, ...patch });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.path).toEqual(path);
  });
});
