import { Logger } from '@nestjs/common';
import { correlationFields } from '../observability/request-context';
import type {
  AgentDecisionService,
  AgentToolDescription,
} from '../agent/agent-decision.service';
import {
  AgentDecisionSchema,
  ToolObservationSchema,
} from '../agent/agent.schema';
import { AgentRunError } from '../agent/agent-run.error';
import type { AgentRunErrorCode } from '../agent/agent-run.error';
import type { ToolExecutor } from '../tools/tool-executor';
import { ToolExecutionError } from '../tools/tool-execution.error';
import type { ToolPermissionContext } from '../tools/tool';
import { prepareCheckpointResume, restoreCheckpoint } from './checkpoint';
import type { Checkpoint } from './checkpoint';
import { transitionOrchestration } from './orchestration';

export class Orchestrator {
  private readonly logger = new Logger(Orchestrator.name);
  constructor(
    private readonly decisions: Pick<AgentDecisionService, 'decide'>,
    private readonly executor: Pick<ToolExecutor, 'execute'>,
  ) {}

  async advance(
    data: unknown,
    tools: readonly AgentToolDescription[],
    context: ToolPermissionContext,
    signal?: AbortSignal,
  ): Promise<Checkpoint> {
    const started = performance.now();
    const correlation = correlationFields();
    let result: Checkpoint | undefined;
    try {
      result = await this.advanceOnce(data, tools, context, signal);
      return result;
    } finally {
      try {
        this.logger.log({
          event: 'orchestration_advance',
          ...correlation,
          durationMs: Math.max(0, performance.now() - started),
          outcome: !result
            ? 'rejected'
            : result.state.phase === 'failed'
              ? 'failure'
              : result.state.phase === 'completed'
                ? 'completed'
                : 'continued',
          ...(result
            ? {
                phase: result.state.phase,
                iterationsConsumed: result.iterationsConsumed,
              }
            : {}),
          ...(!result
            ? { code: 'INVALID_INPUT' }
            : result.state.phase === 'failed'
              ? { code: result.state.code }
              : {}),
        });
      } catch {
        // Best-effort diagnostics cannot change execution results.
      }
    }
  }

  private async advanceOnce(
    data: unknown,
    tools: readonly AgentToolDescription[],
    context: ToolPermissionContext,
    signal?: AbortSignal,
  ): Promise<Checkpoint> {
    // Without a valid domain state there is no honest failed checkpoint to return.
    const checkpoint = restoreCheckpoint(data);
    if (
      checkpoint.state.phase === 'completed' ||
      checkpoint.state.phase === 'failed'
    )
      return checkpoint;
    let stopped: AgentRunError | undefined;
    const check = () => {
      if (stopped) throw stopped;
      if (signal?.aborted) throw (stopped = new AgentRunError('CANCELLED'));
      if (Date.now() >= checkpoint.deadlineEpochMs)
        throw (stopped = new AgentRunError('TIMEOUT'));
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancel: (() => void) | undefined;
    const stop = new Promise<never>((_, reject) => {
      const terminate = (code: AgentRunErrorCode) => {
        stopped ??= new AgentRunError(code);
        reject(stopped);
      };
      const schedule = () => {
        const remaining = checkpoint.deadlineEpochMs - Date.now();
        if (remaining <= 0) terminate('TIMEOUT');
        else timer = setTimeout(schedule, Math.min(remaining, 2_147_483_647));
      };
      timer = setTimeout(
        schedule,
        Math.max(
          1,
          Math.min(checkpoint.deadlineEpochMs - Date.now(), 2_147_483_647),
        ),
      );
      cancel = () => terminate('CANCELLED');
      signal?.addEventListener('abort', cancel, { once: true });
    });
    const execute = async () => {
      check();
      if (checkpoint.state.phase !== 'awaiting_decision')
        throw new AgentRunError('INVALID_INPUT');
      if (checkpoint.iterationsConsumed >= checkpoint.maxIterations)
        throw new AgentRunError('LOOP_LIMIT');
      let permissions: ToolPermissionContext;
      let descriptions: AgentToolDescription[];
      try {
        prepareCheckpointResume(checkpoint, Date.now(), context);
        permissions = { grantedPermissions: [...context.grantedPermissions] };
        descriptions = tools.map(({ name, description }) => ({
          name,
          description,
        }));
      } catch {
        check();
        throw new AgentRunError('INVALID_INPUT');
      }
      check();
      checkpoint.iterationsConsumed++;
      let raw: unknown;
      try {
        raw = await this.decisions.decide(
          structuredClone(checkpoint.state.agentState),
          descriptions,
        );
      } catch {
        check();
        throw new AgentRunError('DECISION_FAILED');
      }
      check();
      const decision = AgentDecisionSchema.safeParse(raw);
      if (!decision.success) throw new AgentRunError('INVALID_DECISION');
      checkpoint.state = transitionOrchestration(checkpoint.state, {
        type: 'decision',
        decision: decision.data,
      });
      check();
      if (decision.data.type === 'finish') return restoreCheckpoint(checkpoint);
      const call = decision.data;
      let observation;
      try {
        const result = await this.executor.execute(
          call.toolName,
          structuredClone(call.arguments),
          permissions,
        );
        check();
        observation = ToolObservationSchema.parse({
          status: 'success',
          call,
          result,
        });
      } catch (error) {
        check();
        if (!(error instanceof ToolExecutionError))
          throw new AgentRunError('INTERNAL');
        observation = ToolObservationSchema.parse({
          status: 'failure',
          call,
          code: error.code,
        });
      }
      check();
      checkpoint.state = transitionOrchestration(checkpoint.state, {
        type: 'observation',
        observation,
      });
      check();
      return restoreCheckpoint(checkpoint);
    };
    try {
      return await Promise.race([execute(), stop]);
    } catch (error) {
      let failure: unknown = error;
      try {
        check();
      } catch (cause) {
        failure = cause;
      }
      return restoreCheckpoint({
        ...checkpoint,
        state: {
          phase: 'failed',
          agentState: checkpoint.state.agentState,
          code: failure instanceof AgentRunError ? failure.code : 'INTERNAL',
        },
      });
    } finally {
      clearTimeout(timer);
      if (cancel) signal?.removeEventListener('abort', cancel);
    }
  }
}
