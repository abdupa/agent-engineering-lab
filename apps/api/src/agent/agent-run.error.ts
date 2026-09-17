export type AgentRunErrorCode =
  | 'INVALID_INPUT'
  | 'DECISION_FAILED'
  | 'INVALID_DECISION'
  | 'LOOP_LIMIT'
  | 'BUDGET_EXCEEDED'
  | 'TIMEOUT'
  | 'CANCELLED'
  | 'INTERNAL';

const messages: Record<AgentRunErrorCode, string> = {
  INVALID_INPUT: 'Agent run input is invalid',
  DECISION_FAILED: 'Agent decision generation failed',
  INVALID_DECISION: 'Agent decision is invalid',
  LOOP_LIMIT: 'Agent iteration limit reached',
  BUDGET_EXCEEDED: 'Agent token budget exhausted',
  TIMEOUT: 'Agent run timed out',
  CANCELLED: 'Agent run cancelled',
  INTERNAL: 'Agent execution failed',
};

export class AgentRunError extends Error {
  constructor(readonly code: AgentRunErrorCode) {
    super(messages[code]);
    this.name = 'AgentRunError';
  }
}
