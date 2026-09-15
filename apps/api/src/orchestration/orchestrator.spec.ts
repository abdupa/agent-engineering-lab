import { Logger } from '@nestjs/common';
import { Orchestrator } from './orchestrator';
import { AgentDecisionService } from '../agent/agent-decision.service';
import type {
  ModelProvider,
  StructuredGenerationRequest,
} from '../ai/model-provider';
import { ToolExecutor } from '../tools/tool-executor';
import { ToolRegistry } from '../tools/tool-registry';
import { addNumbersTool } from '../tools/add-numbers.tool';
import type { AgentDecision } from '../agent/agent.schema';

const call: AgentDecision = {
  type: 'tool_call',
  toolName: 'add-numbers',
  arguments: { left: 2, right: 3 },
};
const context = { grantedPermissions: ['calculate'] };
const initial = () => ({
  version: 1,
  state: {
    phase: 'awaiting_decision',
    agentState: { goal: 'Add', observations: [] },
  },
  iterationsConsumed: 0,
  maxIterations: 2,
  deadlineEpochMs: Date.now() + 1000,
});
function setup() {
  const decide = jest
    .fn<Promise<AgentDecision>, []>()
    .mockResolvedValue({ type: 'finish', result: '5' });
  const registry = new ToolRegistry();
  registry.register(addNumbersTool);
  const executor = new ToolExecutor(registry);
  const execute = jest.spyOn(executor, 'execute');
  return {
    decide,
    execute,
    orchestrator: new Orchestrator({ decide }, executor),
  };
}
describe('Orchestrator advance', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => {
    expect(jest.getTimerCount()).toBe(0);
    jest.useRealTimers();
    jest.restoreAllMocks();
  });
  it('composes fake provider with real service/executor across two caller-driven advances', async () => {
    let count = 0;
    const provider: ModelProvider = {
      generateStructured<T>(
        request: StructuredGenerationRequest<T>,
      ): Promise<T> {
        count++;
        if (count === 2)
          expect(JSON.parse(request.input)).toMatchObject({
            state: { observations: [{ status: 'success', result: 5 }] },
          });
        return Promise.resolve(
          request.schema.parse({
            decision:
              count === 1
                ? {
                    type: 'tool_call',
                    toolName: 'add-numbers',
                    argumentsJson: '{"left":2,"right":3}',
                  }
                : { type: 'finish', result: '5' },
          }),
        );
      },
    };
    const registry = new ToolRegistry();
    registry.register(addNumbersTool);
    const orchestrator = new Orchestrator(
      new AgentDecisionService(provider),
      new ToolExecutor(registry),
    );
    const original = initial();
    const first = await orchestrator.advance(original, [], context);
    expect(first.state.phase).toBe('awaiting_decision');
    expect(first.iterationsConsumed).toBe(1);
    expect(count).toBe(1);
    const second = await orchestrator.advance(first, [], context);
    expect(second.state).toMatchObject({ phase: 'completed', result: '5' });
    expect(second.iterationsConsumed).toBe(2);
    expect(second.deadlineEpochMs).toBe(original.deadlineEpochMs);
    expect(original.iterationsConsumed).toBe(0);
  });
  it('records safe tool failure and requires fresh grants on the next call', async () => {
    const { orchestrator, decide } = setup();
    decide.mockResolvedValue(call);
    const first = await orchestrator.advance(initial(), [], {
      grantedPermissions: [],
    });
    expect(first.state.agentState.observations).toMatchObject([
      { status: 'failure', code: 'DENIED' },
    ]);
    const second = await orchestrator.advance(first, [], context);
    expect(second.state.agentState.observations[1]).toMatchObject({
      status: 'success',
      result: 5,
    });
    const third = await orchestrator.advance(second, [], context);
    expect(third.state).toMatchObject({ phase: 'failed', code: 'LOOP_LIMIT' });
    expect(decide).toHaveBeenCalledTimes(2);
  });
  it.each(['DECISION_FAILED', 'INVALID_DECISION', 'INTERNAL'] as const)(
    'normalizes %s into a terminal snapshot',
    async (code) => {
      const { orchestrator, decide, execute } = setup();
      if (code === 'DECISION_FAILED')
        decide.mockRejectedValue(new Error('private'));
      if (code === 'INVALID_DECISION')
        decide.mockResolvedValue({ type: 'finish', result: '' });
      if (code === 'INTERNAL') {
        decide.mockResolvedValue(call);
        execute.mockRejectedValue(new Error('private'));
      }
      const output = await orchestrator.advance(initial(), [], context);
      expect(output.state).toMatchObject({ phase: 'failed', code });
      expect(JSON.stringify(output)).not.toContain('private');
    },
  );
  it.each(['TIMEOUT', 'CANCELLED'] as const)(
    'stops pending work for %s and ignores late results',
    async (code) => {
      const { orchestrator, decide, execute } = setup();
      let resolve!: (decision: AgentDecision) => void;
      decide.mockImplementation(
        () =>
          new Promise((done) => {
            resolve = done;
          }),
      );
      const controller = new AbortController();
      const pending = orchestrator.advance(
        initial(),
        [],
        context,
        controller.signal,
      );
      if (code === 'TIMEOUT') await jest.advanceTimersByTimeAsync(1000);
      else controller.abort();
      const output = await pending;
      expect(output.state).toMatchObject({ phase: 'failed', code });
      resolve(call);
      await jest.advanceTimersByTimeAsync(0);
      expect(execute).not.toHaveBeenCalled();
      expect(output.state.phase).toBe('failed');
    },
  );
  it('counts suspended time and never resets the deadline', async () => {
    const { orchestrator, decide } = setup();
    decide.mockResolvedValue(call);
    const first = await orchestrator.advance(initial(), [], context);
    await jest.advanceTimersByTimeAsync(1000);
    expect(
      (await orchestrator.advance(first, [], context)).state,
    ).toMatchObject({ phase: 'failed', code: 'TIMEOUT' });
    expect(decide).toHaveBeenCalledTimes(1);
  });
  it('does not execute restored pending or terminal states', async () => {
    const { orchestrator, decide, execute } = setup();
    const pending = {
      ...initial(),
      state: {
        ...initial().state,
        phase: 'awaiting_tool_result',
        pendingCall: call,
      },
    };
    expect(
      (await orchestrator.advance(pending, [], context)).state,
    ).toMatchObject({ phase: 'failed', code: 'INVALID_INPUT' });
    const terminal = {
      ...initial(),
      state: {
        phase: 'completed',
        agentState: initial().state.agentState,
        result: '5',
      },
    };
    expect(await orchestrator.advance(terminal, [], context)).toEqual(terminal);
    expect(decide).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });
  it('rejects malformed checkpoint without fabricating domain state', async () => {
    await expect(setup().orchestrator.advance({}, [], context)).rejects.toThrow(
      'Invalid checkpoint',
    );
  });
});
