import { z } from 'zod';

const nonEmptyString = z.string().trim().min(1);

// Runtime schemas validate unknown data; inferred types below are compile-time only.
export const ResearchQuestionSchema = z.object({
  id: nonEmptyString,
  question: nonEmptyString,
  rationale: nonEmptyString,
});

export const RequiredEvidenceSchema = z.object({
  topic: nonEmptyString,
  reason: nonEmptyString,
});

export const ResearchPlanSchema = z.object({
  objective: nonEmptyString,
  researchQuestions: z.array(ResearchQuestionSchema),
  assumptions: z.array(nonEmptyString),
  requiredEvidence: z.array(RequiredEvidenceSchema),
  unknowns: z.array(nonEmptyString),
});

export type ResearchQuestion = z.infer<typeof ResearchQuestionSchema>;
export type RequiredEvidence = z.infer<typeof RequiredEvidenceSchema>;
export type ResearchPlan = z.infer<typeof ResearchPlanSchema>;
