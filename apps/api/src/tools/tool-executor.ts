import { Logger } from '@nestjs/common';
import { correlationFields } from '../observability/request-context';
import { ToolRegistry } from './tool-registry';
import type { ToolExecutionContext, ToolPermissionContext } from './tool';
import { ToolExecutionError } from './tool-execution.error';

export class ToolExecutor {
  private readonly logger = new Logger(ToolExecutor.name);
  constructor(
    private readonly registry: ToolRegistry,
    private readonly timeoutMs = 5000,
  ) {
    if (
      !Number.isInteger(timeoutMs) ||
      timeoutMs < 1 ||
      timeoutMs > 2_147_483_647
    ) {
      throw new Error(
        'Tool timeout must be a positive supported integer in milliseconds',
      );
    }
  }

  async execute(
    name: string,
    input: unknown,
    permissions?: ToolPermissionContext,
  ): Promise<unknown> {
    const started = performance.now();
    const correlation = correlationFields();
    let toolName = '[unregistered]';
    let outcome = 'success';
    let code: string | undefined;
    const controller = new AbortController();
    const checkDeadline = () => {
      if (
        controller.signal.aborted ||
        performance.now() - started >= this.timeoutMs
      ) {
        controller.abort();
        throw new ToolExecutionError('TIMEOUT');
      }
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new ToolExecutionError('TIMEOUT'));
        controller.abort();
      }, this.timeoutMs);
    });
    const run = async () => {
      const tool = this.registry.get(name);
      if (!tool) throw new ToolExecutionError('NOT_FOUND');
      toolName =
        /^[a-zA-Z0-9._:-]{1,128}$/.test(tool.name) &&
        !tool.name.startsWith('sk-')
          ? tool.name
          : '[invalid-tool-name]';
      if (
        !permissions ||
        !Array.isArray(permissions.grantedPermissions) ||
        !tool.requiredPermissions.every((permission) =>
          permissions.grantedPermissions.includes(permission),
        )
      ) {
        throw new ToolExecutionError('DENIED');
      }
      const context: ToolExecutionContext = Object.freeze({
        grantedPermissions: Object.freeze(
          Array.from<string>(permissions.grantedPermissions),
        ),
        signal: controller.signal,
      });
      checkDeadline();
      let parsedInput: unknown;
      try {
        parsedInput = await tool.inputSchema.parseAsync(input);
      } catch {
        checkDeadline();
        throw new ToolExecutionError('INVALID_INPUT');
      }
      checkDeadline();
      let output: unknown;
      try {
        // Typed registration pairs this handler and schema; only parsed input crosses.
        const invoke = tool.execute as (
          value: unknown,
          context: ToolExecutionContext,
        ) => Promise<unknown>;
        output = await invoke(parsedInput, context);
      } catch {
        checkDeadline();
        throw new ToolExecutionError('EXECUTION_FAILED');
      }
      checkDeadline();
      try {
        const result = await tool.outputSchema.parseAsync(output);
        checkDeadline();
        return result;
      } catch {
        checkDeadline();
        throw new ToolExecutionError('INVALID_OUTPUT');
      }
    };
    try {
      return await Promise.race([run(), deadline]);
    } catch (error) {
      outcome = 'failure';
      code = error instanceof ToolExecutionError ? error.code : 'INTERNAL';
      throw error;
    } finally {
      clearTimeout(timer);
      // Diagnostic delivery must not replace the execution result or failure.
      try {
        this.logger.log({
          event: 'tool_execution',
          ...correlation,
          tool: toolName,
          durationMs: Math.max(0, performance.now() - started),
          outcome,
          ...(code === undefined ? {} : { code }),
        });
      } catch {
        // Console diagnostics are best-effort, not a durable audit sink.
      }
    }
  }
}
