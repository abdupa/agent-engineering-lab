export type ToolExecutionErrorCode =
  | 'NOT_FOUND'
  | 'DENIED'
  | 'INVALID_INPUT'
  | 'EXECUTION_FAILED'
  | 'INVALID_OUTPUT'
  | 'TIMEOUT';

const messages: Record<ToolExecutionErrorCode, string> = {
  NOT_FOUND: 'Tool is not registered',
  DENIED: 'Tool execution denied',
  INVALID_INPUT: 'Tool input validation failed',
  EXECUTION_FAILED: 'Tool execution failed',
  INVALID_OUTPUT: 'Tool output validation failed',
  TIMEOUT: 'Tool execution timed out',
};

export class ToolExecutionError extends Error {
  constructor(readonly code: ToolExecutionErrorCode) {
    super(messages[code]);
    this.name = 'ToolExecutionError';
  }
}
