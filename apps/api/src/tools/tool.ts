import type { ZodType } from 'zod';

export interface ToolPermissionContext {
  readonly grantedPermissions: readonly string[];
}

export interface ToolExecutionContext extends ToolPermissionContext {
  readonly signal: AbortSignal;
}

export interface Tool<Input, Output> {
  readonly name: string;
  readonly description: string;
  readonly requiredPermissions: readonly string[];
  readonly inputSchema: ZodType<Input>;
  readonly outputSchema: ZodType<Output>;
  /** Receives parsed input. Controlled invocation and output validation are separate. */
  readonly execute: (
    input: Input,
    context: ToolExecutionContext,
  ) => Promise<Output>;
}

// Heterogeneous discovery must not pretend every handler accepts arbitrary input.
// Lookup exposes schemas, but cannot safely invoke a handler without narrowing.
export type RegisteredTool = Omit<Tool<never, unknown>, 'inputSchema'> & {
  readonly inputSchema: ZodType;
};
