import { Logger } from '@nestjs/common';
import { z } from 'zod';
import { AgentRunner } from './agent-runner';
import { AgentDecisionService } from './agent-decision.service';
import type { AgentDecision, AgentState } from './agent.schema';
import { ToolExecutionError } from '../tools/tool-execution.error';
import { ToolExecutor } from '../tools/tool-executor';
import { ToolRegistry } from '../tools/tool-registry';
import { addNumbersTool } from '../tools/add-numbers.tool';
import type {
  ModelProvider,
  StructuredGenerationRequest,
} from '../ai/model-provider';

const state: AgentState = { goal: 'Add', observations: [] };
const call: AgentDecision = {
  type: 'tool_call',
  toolName: 'add-numbers',
  arguments: { left: 1, right: 2 },
};
function setup(options: { maxIterations?: number; timeoutMs?: number } = {}) {
  const decide = jest
    .fn<Promise<AgentDecision>, [AgentState]>()
    .mockResolvedValue({ type: 'finish', result: 'done' });
  const execute = jest
    .fn<Promise<unknown>, [string, unknown]>()
    .mockResolvedValue(3);
  return {
    decide,
    execute,
    runner: new AgentRunner({ decide }, { execute }, options),
  };
}

describe('AgentRunner', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('finishes immediately without invoking tools or mutating caller state', async () => {
    const { runner, decide, execute } = setup();
    await expect(runner.run(state, [])).resolves.toEqual({
      result: 'done',
      state,
    });
    expect(decide).toHaveBeenCalledTimes(1);
    expect(execute).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });
  it('exhausts exactly six decisions/tool calls without a forced final answer', async () => {
    const { runner, decide, execute } = setup();
    decide.mockResolvedValue(call);
    await expect(runner.run(state, [])).rejects.toMatchObject({
      code: 'LOOP_LIMIT',
    });
    expect(decide).toHaveBeenCalledTimes(6);
    expect(execute).toHaveBeenCalledTimes(6);
    expect(decide.mock.calls[5]?.[0].observations).toHaveLength(5);
    expect(state.observations).toEqual([]);
    expect(jest.getTimerCount()).toBe(0);
  });
  it('allows finish on the final configurable iteration', async () => {
    const { runner, decide } = setup({ maxIterations: 2 });
    decide.mockResolvedValueOnce(call);
    const output = await runner.run(state, []);
    expect(output.state.observations).toEqual([
      { status: 'success', call, result: 3 },
    ]);
    expect(decide).toHaveBeenCalledTimes(2);
  });
  it.each([
    'NOT_FOUND',
    'DENIED',
    'INVALID_INPUT',
    'EXECUTION_FAILED',
    'INVALID_OUTPUT',
    'TIMEOUT',
  ] as const)(
    'records safe %s and lets the next decision continue',
    async (code) => {
      const { runner, decide, execute } = setup();
      decide.mockResolvedValueOnce(call);
      execute.mockRejectedValue(new ToolExecutionError(code));
      const output = await runner.run(state, []);
      expect(output.state.observations).toEqual([
        { status: 'failure', call, code },
      ]);
      expect(execute).toHaveBeenCalledTimes(1);
      expect(decide.mock.calls[1]?.[0].observations).toEqual(
        output.state.observations,
      );
    },
  );
  it('terminates on decision failure without leaking causes', async () => {
    const { runner, decide, execute } = setup();
    decide.mockRejectedValue(new Error('private-provider-error'));
    const error: unknown = await runner.run(state, []).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: 'DECISION_FAILED' });
    expect(error).not.toHaveProperty('cause');
    expect(String(error)).not.toContain('private');
    expect(execute).not.toHaveBeenCalled();
  });
  it('rejects an invalid canonical decision', async () => {
    const { runner, decide } = setup();
    decide.mockResolvedValue({ type: 'finish', result: ' ' });
    await expect(runner.run(state, [])).rejects.toMatchObject({
      code: 'INVALID_DECISION',
    });
  });
  it.each(['throw', 'non-json-result'])(
    'terminates for internal tool boundary failure %s',
    async (mode) => {
      const { runner, decide, execute } = setup();
      decide.mockResolvedValue(call);
      if (mode === 'throw') execute.mockRejectedValue(new Error('private'));
      else execute.mockResolvedValue(new Date());
      await expect(runner.run(state, [])).rejects.toMatchObject({
        code: 'INTERNAL',
      });
      expect(decide).toHaveBeenCalledTimes(1);
    },
  );
  it('rejects invalid initial state without a decision', async () => {
    const { runner, decide } = setup();
    await expect(
      runner.run({ goal: '', observations: [] }, []),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(decide).not.toHaveBeenCalled();
  });
  it('honors pre-aborted caller signals and removes listeners', async () => {
    const { runner, decide } = setup();
    const controller = new AbortController();
    controller.abort();
    const remove = jest.spyOn(controller.signal, 'removeEventListener');
    await expect(
      runner.run(state, [], { signal: controller.signal }),
    ).rejects.toMatchObject({ code: 'CANCELLED' });
    expect(decide).not.toHaveBeenCalled();
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
    expect(jest.getTimerCount()).toBe(0);
  });
  it.each(['decision', 'tool'])(
    'cancels during %s and suppresses late work',
    async (stage) => {
      const { runner, decide, execute } = setup();
      let finish!: () => void;
      const pending = new Promise<void>((resolve) => {
        finish = resolve;
      });
      decide.mockImplementation(async () => {
        if (stage === 'decision') await pending;
        return call;
      });
      execute.mockImplementation(async () => {
        await pending;
        return 3;
      });
      const controller = new AbortController();
      const result = runner
        .run(state, [], { signal: controller.signal })
        .catch((e: unknown) => e);
      await jest.advanceTimersByTimeAsync(1);
      controller.abort();
      expect(await result).toMatchObject({ code: 'CANCELLED' });
      finish();
      await jest.runAllTimersAsync();
      expect(decide).toHaveBeenCalledTimes(1);
      expect(execute).toHaveBeenCalledTimes(stage === 'decision' ? 0 : 1);
      expect(jest.getTimerCount()).toBe(0);
    },
  );
  it('uses the default 60000 ms deadline for a stalled decision', async () => {
    const { runner, decide } = setup();
    decide.mockImplementation(
      () => new Promise<AgentDecision>(() => undefined),
    );
    const result = runner.run(state, []).catch((e: unknown) => e);
    await jest.advanceTimersByTimeAsync(60000);
    expect(await result).toMatchObject({ code: 'TIMEOUT' });
    expect(jest.getTimerCount()).toBe(0);
  });
  it('does not reset the run deadline across iterations', async () => {
    const { runner, decide, execute } = setup({ timeoutMs: 10 });
    decide.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(call), 6)),
    );
    const result = runner.run(state, []).catch((e: unknown) => e);
    await jest.advanceTimersByTimeAsync(10);
    expect(await result).toMatchObject({ code: 'TIMEOUT' });
    await jest.runAllTimersAsync();
    expect(decide).toHaveBeenCalledTimes(2);
    expect(execute).toHaveBeenCalledTimes(1);
  });
  it.each([0, -1, 1.5, Infinity])(
    'rejects invalid iteration configuration %s',
    (maxIterations) => {
      expect(() => setup({ maxIterations })).toThrow('Agent iteration limit');
    },
  );
  it.each([0, -1, 1.5, Infinity, 2_147_483_648])(
    'rejects invalid deadline %s',
    (timeoutMs) => {
      expect(() => setup({ timeoutMs })).toThrow('Agent timeout');
    },
  );
  it('integrates the decision translator and real executor, observing validated output only', async () => {
    const registry = new ToolRegistry();
    registry.register({
      ...addNumbersTool,
      outputSchema: z.number().transform((value) => value + 10),
    });
    let requests = 0;
    const provider: ModelProvider = {
      generateStructured<T>(
        request: StructuredGenerationRequest<T>,
      ): Promise<T> {
        requests++;
        return Promise.resolve(
          request.schema.parse({
            decision:
              requests === 1
                ? {
                    type: 'tool_call',
                    toolName: 'add-numbers',
                    argumentsJson: '{"left":1,"right":2}',
                  }
                : { type: 'finish', result: '13' },
          }),
        );
      },
    };
    const runner = new AgentRunner(
      new AgentDecisionService(provider),
      new ToolExecutor(registry),
    );
    const result = await runner.run(
      state,
      [{ name: 'add-numbers', description: 'Add left/right numbers' }],
      { permissions: { grantedPermissions: ['calculate'] } },
    );
    expect(result.state.observations).toEqual([
      { status: 'success', call, result: 13 },
    ]);
    expect(requests).toBe(2);
  });
});
