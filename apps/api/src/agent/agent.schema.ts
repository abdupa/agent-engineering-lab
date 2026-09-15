import { z } from 'zod';
import type { ToolExecutionErrorCode } from '../tools/tool-execution.error';

const nonEmptyText = z.string().trim().min(1);
export const JsonValueSchema = z.json();
export const JsonObjectSchema = z.record(z.string(), JsonValueSchema);

export const ToolCallSchema = z.object({
  type: z.literal('tool_call'),
  toolName: nonEmptyText,
  arguments: JsonObjectSchema,
});

// Internal domain schema, not a directly OpenAI-compatible response format.
export const AgentDecisionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('finish'), result: nonEmptyText }),
  ToolCallSchema,
]);

// Exhaustiveness keeps this runtime list aligned with the existing tool contract.
const toolFailureCodes = {
  NOT_FOUND: 'NOT_FOUND',
  DENIED: 'DENIED',
  INVALID_INPUT: 'INVALID_INPUT',
  EXECUTION_FAILED: 'EXECUTION_FAILED',
  INVALID_OUTPUT: 'INVALID_OUTPUT',
  TIMEOUT: 'TIMEOUT',
} as const satisfies Record<ToolExecutionErrorCode, ToolExecutionErrorCode>;

export const ToolObservationSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('success'),
    call: ToolCallSchema,
    // Must be supplied after ToolExecutor output validation, never raw handler output.
    result: JsonValueSchema,
  }),
  z.object({
    status: z.literal('failure'),
    call: ToolCallSchema,
    code: z.enum(toolFailureCodes),
  }),
]);

export const AgentStateSchema = z.object({
  goal: nonEmptyText,
  observations: z.array(ToolObservationSchema),
});

export type AgentDecision = z.infer<typeof AgentDecisionSchema>;
export type ToolCall = z.infer<typeof ToolCallSchema>;
export type ToolObservation = z.infer<typeof ToolObservationSchema>;
export type AgentState = z.infer<typeof AgentStateSchema>;
