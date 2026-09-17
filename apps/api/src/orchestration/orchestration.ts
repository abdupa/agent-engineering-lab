import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import {
  AgentDecisionSchema,
  AgentStateSchema,
  ToolCallSchema,
  ToolObservationSchema,
} from '../agent/agent.schema';
import type { AgentRunErrorCode } from '../agent/agent-run.error';

const failureCodes = {
  INVALID_INPUT: 'INVALID_INPUT',
  DECISION_FAILED: 'DECISION_FAILED',
  INVALID_DECISION: 'INVALID_DECISION',
  LOOP_LIMIT: 'LOOP_LIMIT',
  BUDGET_EXCEEDED: 'BUDGET_EXCEEDED',
  TIMEOUT: 'TIMEOUT',
  CANCELLED: 'CANCELLED',
  INTERNAL: 'INTERNAL',
} as const satisfies Record<AgentRunErrorCode, AgentRunErrorCode>;
const failureCode = z.enum(failureCodes);

// Strict control envelopes reject contradictory phase fields rather than hiding them.
export const OrchestrationStateSchema = z.discriminatedUnion('phase', [
  z.strictObject({
    phase: z.literal('awaiting_decision'),
    agentState: AgentStateSchema,
  }),
  z.strictObject({
    phase: z.literal('awaiting_tool_result'),
    agentState: AgentStateSchema,
    pendingCall: ToolCallSchema,
  }),
  z.strictObject({
    phase: z.literal('completed'),
    agentState: AgentStateSchema,
    result: z.string().trim().min(1),
  }),
  z.strictObject({
    phase: z.literal('failed'),
    agentState: AgentStateSchema,
    code: failureCode,
  }),
]);
export const OrchestrationEventSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('decision'),
    decision: AgentDecisionSchema,
  }),
  z.strictObject({
    type: z.literal('observation'),
    observation: ToolObservationSchema,
  }),
  z.strictObject({ type: z.literal('failure'), code: failureCode }),
]);
export type OrchestrationState = z.infer<typeof OrchestrationStateSchema>;
export type OrchestrationEvent = z.infer<typeof OrchestrationEventSchema>;

/** Logical progress only: callers must supply executor-validated observations. */
export function transitionOrchestration(
  state: OrchestrationState,
  event: OrchestrationEvent,
): OrchestrationState {
  try {
    const current = OrchestrationStateSchema.parse(state);
    const next = OrchestrationEventSchema.parse(event);
    if (current.phase === 'completed' || current.phase === 'failed')
      throw new Error();
    const agentState = current.agentState;
    if (next.type === 'failure')
      return { phase: 'failed', agentState, code: next.code };
    if (current.phase === 'awaiting_decision' && next.type === 'decision') {
      return next.decision.type === 'finish'
        ? { phase: 'completed', agentState, result: next.decision.result }
        : {
            phase: 'awaiting_tool_result',
            agentState,
            pendingCall: next.decision,
          };
    }
    if (
      current.phase === 'awaiting_tool_result' &&
      next.type === 'observation' &&
      isDeepStrictEqual(current.pendingCall, next.observation.call)
    ) {
      return {
        phase: 'awaiting_decision',
        agentState: {
          ...agentState,
          observations: [...agentState.observations, next.observation],
        },
      };
    }
    throw new Error();
  } catch {
    throw new Error('Invalid orchestration transition');
  }
}
