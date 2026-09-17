import { Logger } from '@nestjs/common';
import { AgentRunner } from './agent-runner';
import { AgentRunError } from './agent-run.error';
import type { AgentToolDescription } from './agent-decision.service';
import type { AgentDecision } from './agent.schema';
import { recordUsage, withUsage } from '../observability/usage';
import { ToolExecutionError } from '../tools/tool-execution.error';

/**
 * Budgets bounded steps and wall time but never cost, which is an inconsistency in
 * something already treated as a safety boundary. A live run burned 41,677 input tokens
 * and produced nothing; growth is roughly quadratic in step count, so a larger step cap
 * on a bigger codebase is a real runaway rather than a hypothetical one.
 */

const tools: AgentToolDescription[] = [
  { name: 'noop', description: 'Does nothing' },
];

/** Spends a fixed number of tokens per decision, the way a real provider would. */
function spendingDecisions(perCall: number, script: AgentDecision[]) {
  let index = 0;
  return {
    decide: () => {
      recordUsage(perCall, 0);
      const next = script[Math.min(index++, script.length - 1)];
      return Promise.resolve(next as AgentDecision);
    },
    get calls() {
      return index;
    },
  };
}

const callTool: AgentDecision = {
  type: 'tool_call',
  toolName: 'noop',
  arguments: {},
};
const finish: AgentDecision = { type: 'finish', result: 'Done.' };

const executor = { execute: () => Promise.resolve({ ok: true }) };

beforeEach(() => {
  jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('a run with no budget', () => {
  it('is unbounded by cost, exactly as before', async () => {
    const decisions = spendingDecisions(1_000_000, [finish]);
    const runner = new AgentRunner(decisions, executor);
    await expect(
      runner.run({ goal: 'Spend freely', observations: [] }, tools),
    ).resolves.toMatchObject({ result: 'Done.' });
  });
});

describe('a run with a budget', () => {
  it('stops once spending crosses the ceiling', async () => {
    // 400 tokens per decision against a 1,000 ceiling: the third check sees 1,200.
    const decisions = spendingDecisions(400, [callTool]);
    const runner = new AgentRunner(decisions, executor, {
      maxIterations: 50,
      maxTokens: 1_000,
    });

    await expect(
      runner.run({ goal: 'Loop forever', observations: [] }, tools),
    ).rejects.toMatchObject({ code: 'BUDGET_EXCEEDED' });

    // Stopped on budget, nowhere near the 50-step cap.
    expect(decisions.calls).toBeLessThan(10);
  });

  it('completes when the work fits inside the budget', async () => {
    const decisions = spendingDecisions(100, [callTool, callTool, finish]);
    const runner = new AgentRunner(decisions, executor, {
      maxTokens: 100_000,
    });
    await expect(
      runner.run({ goal: 'Small job', observations: [] }, tools),
    ).resolves.toMatchObject({ result: 'Done.' });
  });

  it('reports the budget failure as an AgentRunError with a safe message', async () => {
    const decisions = spendingDecisions(5_000, [callTool]);
    const runner = new AgentRunner(decisions, executor, { maxTokens: 1 });
    const failure = await runner
      .run({ goal: 'Overspend', observations: [] }, tools)
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(AgentRunError);
    expect(failure).toMatchObject({
      code: 'BUDGET_EXCEEDED',
      message: 'Agent token budget exhausted',
    });
  });

  it('keeps observations recorded before the budget ran out', async () => {
    // A failing tool still produces an observation, so work done before the stop is
    // visible to whatever inspects the run.
    const failing = {
      execute: () => Promise.reject(new ToolExecutionError('DENIED')),
    };
    const decisions = spendingDecisions(600, [callTool]);
    const runner = new AgentRunner(decisions, failing, {
      maxIterations: 50,
      maxTokens: 1_000,
    });
    const state = { goal: 'Partial work', observations: [] };
    await expect(runner.run(state, tools)).rejects.toMatchObject({
      code: 'BUDGET_EXCEEDED',
    });
    // The runner never mutates the caller's object.
    expect(state.observations).toEqual([]);
  });
});

describe('the budget option itself', () => {
  it.each([[0], [-1], [1.5], [Number.NaN]])(
    'rejects the invalid budget %p at construction',
    (value) => {
      expect(
        () =>
          new AgentRunner({ decide: () => Promise.resolve(finish) }, executor, {
            maxTokens: value,
          }),
      ).toThrow('positive safe integer');
    },
  );
});

describe('nested usage scopes', () => {
  it('credits an enclosing scope even though the run opens its own', async () => {
    const decisions = spendingDecisions(250, [callTool, callTool, finish]);
    const runner = new AgentRunner(decisions, executor, { maxTokens: 100_000 });

    const { usage } = await withUsage(() =>
      runner.run({ goal: 'Report upward', observations: [] }, tools),
    );

    // Without scope nesting the run's private scope would swallow these and the
    // caller would report zero — which is how the endpoint's usage block would break.
    expect(usage.calls).toBe(3);
    expect(usage.totalTokens).toBe(750);
  });

  it('still reports usage when the run has no budget and opens no scope', async () => {
    const decisions = spendingDecisions(120, [finish]);
    const runner = new AgentRunner(decisions, executor);
    const { usage } = await withUsage(() =>
      runner.run({ goal: 'No budget', observations: [] }, tools),
    );
    expect(usage.totalTokens).toBe(120);
  });
});
