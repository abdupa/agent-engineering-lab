import { Logger } from '@nestjs/common';
import { AgentRunner } from './agent-runner';
import { AgentRunError } from './agent-run.error';
import type { AgentDecision } from './agent.schema';
import { ToolExecutionError } from '../tools/tool-execution.error';
import { requestContext } from '../observability/request-context';

const state = { goal: 'private-goal', observations: [] };
const call: AgentDecision = {
  type: 'tool_call',
  toolName: 'private-tool',
  arguments: { secret: 'private-input' },
};
function setup() {
  const decide = jest
    .fn<Promise<AgentDecision>, []>()
    .mockResolvedValue({ type: 'finish', result: 'private-result' });
  const execute = jest
    .fn<Promise<unknown>, []>()
    .mockResolvedValue('private-output');
  return {
    decide,
    execute,
    runner: new AgentRunner(
      { decide },
      { execute },
      { maxIterations: 2, timeoutMs: 10 },
    ),
  };
}

describe('Agent run diagnostics', () => {
  let logs: jest.SpyInstance;
  beforeEach(() => {
    jest.useFakeTimers();
    logs = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('records correlated success with only safe metadata', async () => {
    const { runner, decide } = setup();
    decide.mockResolvedValueOnce(call);
    await requestContext.run({ requestId: 'request-one' }, () =>
      runner.run(
        state,
        [{ name: 'private-tool', description: 'private-description' }],
        { permissions: { grantedPermissions: ['private-grant'] } },
      ),
    );
    expect(logs).toHaveBeenCalledTimes(1);
    expect(logs).toHaveBeenCalledWith({
      event: 'agent_run',
      requestId: 'request-one',
      iterations: 2,
      toolCalls: 1,
      durationMs: expect.any(Number) as unknown,
      outcome: 'success',
    });
    expect(JSON.stringify(logs.mock.calls)).not.toContain('private-');
  });

  it.each([
    'INVALID_INPUT',
    'DECISION_FAILED',
    'INVALID_DECISION',
    'LOOP_LIMIT',
    'TIMEOUT',
    'CANCELLED',
    'INTERNAL',
  ] as const)('preserves safe %s and records one failure', async (code) => {
    const { runner, decide, execute } = setup();
    const controller = new AbortController();
    if (code === 'DECISION_FAILED')
      decide.mockRejectedValue(new Error('private-provider'));
    if (code === 'INVALID_DECISION')
      decide.mockResolvedValue({ type: 'finish', result: '' });
    if (code === 'LOOP_LIMIT' || code === 'INTERNAL')
      decide.mockResolvedValue(call);
    if (code === 'INTERNAL')
      execute.mockRejectedValue(new Error('private-error'));
    if (code === 'TIMEOUT')
      decide.mockImplementation(
        () => new Promise<AgentDecision>(() => undefined),
      );
    if (code === 'CANCELLED') controller.abort();
    const result = runner
      .run(
        code === 'INVALID_INPUT' ? { goal: '', observations: [] } : state,
        [],
        { signal: controller.signal },
      )
      .catch((error: unknown) => error);
    if (code === 'TIMEOUT') await jest.advanceTimersByTimeAsync(10);
    expect(await result).toBeInstanceOf(AgentRunError);
    expect(await result).toMatchObject({ code });
    expect(await result).not.toHaveProperty('cause');
    expect(logs).toHaveBeenCalledTimes(1);
    expect(logs).toHaveBeenCalledWith({
      event: 'agent_run',
      iterations: decide.mock.calls.length,
      toolCalls: execute.mock.calls.length,
      durationMs: expect.any(Number) as unknown,
      outcome: 'failure',
      code,
    });
    expect(JSON.stringify(logs.mock.calls)).not.toContain('private-');
    expect(jest.getTimerCount()).toBe(0);
  });

  it('keeps safe tool failure continuation distinct from run failure', async () => {
    const { runner, decide, execute } = setup();
    decide.mockResolvedValueOnce(call);
    execute.mockRejectedValue(new ToolExecutionError('DENIED'));
    const result = await runner.run(state, []);
    expect(result.state.observations[0]).toMatchObject({
      status: 'failure',
      code: 'DENIED',
    });
    expect(logs).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'success',
        iterations: 2,
        toolCalls: 1,
      }),
    );
  });

  it('isolates concurrent runs and omits missing request context', async () => {
    const { runner } = setup();
    await Promise.all(
      ['one', 'two'].map((requestId) =>
        requestContext.run({ requestId }, () => runner.run(state, [])),
      ),
    );
    await runner.run(state, []);
    const calls = logs.mock.calls as unknown[][];
    expect(calls[0]?.[0]).toMatchObject({ requestId: 'one', iterations: 1 });
    expect(calls[1]?.[0]).toMatchObject({ requestId: 'two', iterations: 1 });
    expect(calls[2]?.[0]).not.toHaveProperty('requestId');
    expect(requestContext.getStore()).toBeUndefined();
  });

  it.each(['TIMEOUT', 'CANCELLED'])(
    'does not log duplicate summaries after late decision for %s',
    async (code) => {
      const { runner, decide, execute } = setup();
      let resolve!: (value: AgentDecision) => void;
      decide.mockImplementation(
        () =>
          new Promise<AgentDecision>((done) => {
            resolve = done;
          }),
      );
      const controller = new AbortController();
      const result = runner
        .run(state, [], { signal: controller.signal })
        .catch((error: unknown) => error);
      if (code === 'TIMEOUT') await jest.advanceTimersByTimeAsync(10);
      else controller.abort();
      expect(await result).toMatchObject({ code });
      resolve(call);
      await jest.runAllTimersAsync();
      expect(execute).not.toHaveBeenCalled();
      expect(logs).toHaveBeenCalledTimes(1);
      expect(logs).toHaveBeenCalledWith(
        expect.objectContaining({ code, iterations: 1, toolCalls: 0 }),
      );
    },
  );

  it('preserves results and normalized errors when logger fails', async () => {
    const { runner, decide } = setup();
    logs.mockImplementation(() => {
      throw new Error('private-logger');
    });
    await expect(runner.run(state, [])).resolves.toMatchObject({
      result: 'private-result',
    });
    decide.mockRejectedValue(new Error('private-provider'));
    await expect(runner.run(state, [])).rejects.toMatchObject({
      code: 'DECISION_FAILED',
    });
    expect(jest.getTimerCount()).toBe(0);
  });
});
