import { Logger } from '@nestjs/common';
import { Orchestrator } from './orchestrator';
import { restoreCheckpoint } from './checkpoint';
import { pauseOrchestration, resumePausedOrchestration } from './pause';
import { requestContext } from '../observability/request-context';
import { ToolExecutor } from '../tools/tool-executor';
import { ToolRegistry } from '../tools/tool-registry';
import { addNumbersTool } from '../tools/add-numbers.tool';
import type { AgentDecision } from '../agent/agent.schema';
const call: AgentDecision = {
  type: 'tool_call',
  toolName: 'add-numbers',
  arguments: { left: 2, right: 3 },
};
const permissions = { grantedPermissions: ['calculate'] };
const initial = () => ({
  version: 1,
  state: {
    phase: 'awaiting_decision',
    agentState: { goal: 'private-goal', observations: [] },
  },
  iterationsConsumed: 0,
  maxIterations: 3,
  deadlineEpochMs: Date.now() + 1000,
});
function setup() {
  const decide = jest.fn<Promise<AgentDecision>, []>().mockResolvedValue(call);
  const registry = new ToolRegistry();
  registry.register(addNumbersTool);
  const executor = new ToolExecutor(registry);
  return { decide, orchestrator: new Orchestrator({ decide }, executor) };
}
describe('Orchestration recovery and diagnostics', () => {
  let log: jest.SpyInstance;
  beforeEach(() => {
    jest.useFakeTimers();
    log = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
  });
  afterEach(() => {
    expect(jest.getTimerCount()).toBe(0);
    jest.useRealTimers();
    jest.restoreAllMocks();
  });
  const events = () =>
    log.mock.calls
      .map(([event]) => event as Record<string, unknown>)
      .filter((event) => event.event === 'orchestration_advance');
  it('restores then continues with preserved budgets and exact safe correlated metadata', async () => {
    const { orchestrator, decide } = setup();
    const original = initial();
    const first = await requestContext.run({ requestId: 'test-id' }, () =>
      orchestrator.advance(original, [], permissions),
    );
    expect(events()).toEqual([
      {
        event: 'orchestration_advance',
        requestId: 'test-id',
        durationMs: expect.any(Number) as unknown,
        outcome: 'continued',
        phase: 'awaiting_decision',
        iterationsConsumed: 1,
      },
    ]);
    decide.mockResolvedValue({ type: 'finish', result: 'private-result' });
    const final = await orchestrator.advance(
      restoreCheckpoint(JSON.parse(JSON.stringify(first))),
      [],
      permissions,
    );
    expect(final.iterationsConsumed).toBe(2);
    expect(final.deadlineEpochMs).toBe(original.deadlineEpochMs);
    expect(events()[1]).not.toHaveProperty('requestId');
    expect(JSON.stringify(events())).not.toMatch(
      /private|calculate|add-numbers/,
    );
  });
  it('serializes pause and resumes with fresh grants without consuming paused time', async () => {
    const { orchestrator } = setup();
    const first = await orchestrator.advance(initial(), [], permissions);
    await jest.advanceTimersByTimeAsync(100);
    const paused = pauseOrchestration(first, Date.now());
    await jest.advanceTimersByTimeAsync(10000);
    const resumed = resumePausedOrchestration(
      JSON.parse(JSON.stringify(paused)),
      Date.now(),
      { grantedPermissions: [] },
    );
    expect(resumed.deadlineEpochMs - Date.now()).toBe(900);
    expect(resumed.iterationsConsumed).toBe(1);
    const result = await orchestrator.advance(resumed, [], {
      grantedPermissions: [],
    });
    expect(result.state.agentState.observations[1]).toMatchObject({
      status: 'failure',
      code: 'DENIED',
    });
    expect(result.iterationsConsumed).toBe(2);
  });
  it('ordinary restoration does not suspend deadline', async () => {
    const { orchestrator, decide } = setup();
    const first = await orchestrator.advance(initial(), [], permissions);
    await jest.advanceTimersByTimeAsync(1000);
    const result = await orchestrator.advance(
      restoreCheckpoint(JSON.parse(JSON.stringify(first))),
      [],
      permissions,
    );
    expect(result.state).toMatchObject({ phase: 'failed', code: 'TIMEOUT' });
    expect(decide).toHaveBeenCalledTimes(1);
    expect(events()[1]).toMatchObject({ outcome: 'failure', code: 'TIMEOUT' });
  });
  it('logs invalid input without data and survives logger failure', async () => {
    const { orchestrator } = setup();
    await expect(
      orchestrator.advance({ secret: 'private' }, [], permissions),
    ).rejects.toThrow('Invalid checkpoint');
    expect(events()).toEqual([
      {
        event: 'orchestration_advance',
        durationMs: expect.any(Number) as unknown,
        outcome: 'rejected',
        code: 'INVALID_INPUT',
      },
    ]);
    log.mockImplementation(() => {
      throw new Error('logger');
    });
    expect(
      (await orchestrator.advance(initial(), [], permissions)).state.phase,
    ).toBe('awaiting_decision');
  });
  it.each(['decision', 'tool'] as const)(
    'suppresses late %s effects after cancellation and deadline',
    async (stage) => {
      for (const reason of ['CANCELLED', 'TIMEOUT']) {
        log.mockClear();
        let complete!: () => void;
        const wait = new Promise<void>((resolve) => {
          complete = resolve;
        });
        const decide = jest.fn(async () => {
          if (stage === 'decision') await wait;
          return call;
        });
        const execute = jest.fn(async () => {
          await wait;
          return 5;
        });
        const orchestrator = new Orchestrator({ decide }, { execute });
        const controller = new AbortController();
        const pending = orchestrator.advance(
          initial(),
          [],
          permissions,
          controller.signal,
        );
        await jest.advanceTimersByTimeAsync(0);
        if (reason === 'CANCELLED') controller.abort();
        else await jest.advanceTimersByTimeAsync(1000);
        const settled = await pending;
        const snapshot = JSON.stringify(settled);
        expect(settled.state).toMatchObject({ phase: 'failed', code: reason });
        complete();
        await jest.advanceTimersByTimeAsync(0);
        expect(JSON.stringify(settled)).toBe(snapshot);
        expect(settled.state.agentState.observations).toEqual([]);
        expect(events()).toHaveLength(1);
        expect(events()[0]).toMatchObject({ code: reason, outcome: 'failure' });
        expect(execute).toHaveBeenCalledTimes(stage === 'tool' ? 1 : 0);
      }
    },
  );
  it('terminal inspection and pending-tool rejection never continue execution', async () => {
    const { orchestrator, decide } = setup();
    for (const state of [
      { phase: 'completed', result: 'done' },
      { phase: 'failed', code: 'CANCELLED' },
      { phase: 'awaiting_tool_result', pendingCall: call },
    ]) {
      await orchestrator.advance(
        {
          ...initial(),
          state: { ...state, agentState: initial().state.agentState },
        },
        [],
        permissions,
      );
    }
    expect(decide).not.toHaveBeenCalled();
    expect(events()).toHaveLength(3);
  });
});
