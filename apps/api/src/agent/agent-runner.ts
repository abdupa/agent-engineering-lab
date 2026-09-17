import { Logger } from '@nestjs/common';
import { correlationFields } from '../observability/request-context';
import type { ToolExecutor } from '../tools/tool-executor';
import { ToolExecutionError } from '../tools/tool-execution.error';
import type { ToolPermissionContext } from '../tools/tool';
import type {
  AgentDecisionService,
  AgentToolDescription,
} from './agent-decision.service';
import {
  AgentDecisionSchema,
  AgentStateSchema,
  ToolObservationSchema,
} from './agent.schema';
import type {
  AgentDecision,
  AgentState,
  ToolObservation,
} from './agent.schema';
import { AgentRunError } from './agent-run.error';

export interface AgentRunOptions {
  readonly permissions?: ToolPermissionContext;
  readonly signal?: AbortSignal;
}

export class AgentRunner {
  private readonly logger = new Logger(AgentRunner.name);
  private readonly maxIterations: number;
  private readonly timeoutMs: number;

  constructor(
    private readonly decisions: Pick<AgentDecisionService, 'decide'>,
    private readonly executor: Pick<ToolExecutor, 'execute'>,
    options: { maxIterations?: number; timeoutMs?: number } = {},
  ) {
    this.maxIterations = options.maxIterations ?? 6;
    this.timeoutMs = options.timeoutMs ?? 60_000;
    if (!Number.isSafeInteger(this.maxIterations) || this.maxIterations < 1) {
      throw new Error('Agent iteration limit must be a positive safe integer');
    }
    if (
      !Number.isInteger(this.timeoutMs) ||
      this.timeoutMs < 1 ||
      this.timeoutMs > 2_147_483_647
    ) {
      throw new Error(
        'Agent timeout must be a positive supported integer in milliseconds',
      );
    }
  }

  async run(
    initialState: AgentState,
    tools: readonly AgentToolDescription[],
    options: AgentRunOptions = {},
  ): Promise<{ result: string; state: AgentState }> {
    const started = performance.now();
    const correlation = correlationFields();
    let iterations = 0;
    let toolCalls = 0;
    let outcome = 'success';
    let failure: AgentRunError | undefined;
    let stopped: AgentRunError | undefined;
    const check = () => {
      if (stopped) throw stopped;
      if (options.signal?.aborted)
        throw (stopped = new AgentRunError('CANCELLED'));
      if (performance.now() - started >= this.timeoutMs)
        throw (stopped = new AgentRunError('TIMEOUT'));
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancel: (() => void) | undefined;
    const stop = new Promise<never>((_, reject) => {
      const terminate = (code: 'TIMEOUT' | 'CANCELLED') => {
        stopped ??= new AgentRunError(code);
        reject(stopped);
      };
      timer = setTimeout(() => terminate('TIMEOUT'), this.timeoutMs);
      cancel = () => terminate('CANCELLED');
      options.signal?.addEventListener('abort', cancel, { once: true });
    });
    const execute = async () => {
      check();
      let state: AgentState;
      let descriptions: AgentToolDescription[];
      let permissions: ToolPermissionContext | undefined;
      try {
        state = AgentStateSchema.parse(initialState);
        // Name, description and input schema only. Handlers, permissions and the
        // executor stay out of anything the decision layer can see; a Zod schema is
        // used to shape the request, never serialized into model input, so it is safe
        // to carry and is what the typed-argument transport needs.
        descriptions = tools.map(({ name, description, inputSchema }) => ({
          name,
          description,
          inputSchema,
        }));
        permissions = options.permissions && {
          grantedPermissions: [...options.permissions.grantedPermissions],
        };
      } catch {
        throw new AgentRunError('INVALID_INPUT');
      }
      for (let iteration = 0; iteration < this.maxIterations; iteration++) {
        check();
        let raw: unknown;
        try {
          // Each decision sees a snapshot; the runner owns observation updates.
          iterations++;
          raw = await this.decisions.decide(
            AgentStateSchema.parse(state),
            descriptions.map((tool) => ({ ...tool })),
          );
        } catch {
          check();
          throw new AgentRunError('DECISION_FAILED');
        }
        check();
        let decision: AgentDecision;
        try {
          decision = AgentDecisionSchema.parse(raw);
        } catch {
          throw new AgentRunError('INVALID_DECISION');
        }
        check();
        if (decision.type === 'finish')
          return { result: decision.result, state };
        let observation: ToolObservation;
        let result: unknown;
        try {
          // No raw handlers are held by this runner. Validation and policy stay here.
          toolCalls++;
          result = await this.executor.execute(
            decision.toolName,
            structuredClone(decision.arguments),
            permissions,
          );
        } catch (error) {
          check();
          if (!(error instanceof ToolExecutionError))
            throw new AgentRunError('INTERNAL');
          observation = ToolObservationSchema.parse({
            status: 'failure',
            call: decision,
            code: error.code,
          });
          state.observations.push(observation);
          continue;
        }
        check();
        // Only the validated executor result is eligible for a success observation.
        observation = ToolObservationSchema.parse({
          status: 'success',
          call: decision,
          result,
        });
        check();
        state.observations.push(observation);
      }
      check();
      throw new AgentRunError('LOOP_LIMIT');
    };
    try {
      return await Promise.race([execute(), stop]);
    } catch (error) {
      let finalError: unknown = error;
      try {
        check();
      } catch (stoppingError) {
        finalError = stoppingError;
      }
      failure =
        finalError instanceof AgentRunError
          ? finalError
          : new AgentRunError('INTERNAL');
      outcome = 'failure';
      throw failure;
    } finally {
      clearTimeout(timer);
      if (cancel) options.signal?.removeEventListener('abort', cancel);
      try {
        this.logger.log({
          event: 'agent_run',
          ...correlation,
          iterations,
          toolCalls,
          durationMs: Math.max(0, performance.now() - started),
          outcome,
          ...(failure ? { code: failure.code } : {}),
        });
      } catch {
        // Best-effort diagnostics must not replace the run's result or failure.
      }
    }
  }
}
