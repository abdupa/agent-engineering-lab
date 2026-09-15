import type {
  ModelProvider,
  StructuredGenerationRequest,
} from '../../src/ai/model-provider';
import { AgentDecisionService } from '../../src/agent/agent-decision.service';
import { AgentRunner } from '../../src/agent/agent-runner';
import { AgentRunError } from '../../src/agent/agent-run.error';
import type { AgentRunErrorCode } from '../../src/agent/agent-run.error';
import { AgentStateSchema } from '../../src/agent/agent.schema';
import type { AgentState, ToolObservation } from '../../src/agent/agent.schema';
import { ToolRegistry } from '../../src/tools/tool-registry';
import { ToolExecutor } from '../../src/tools/tool-executor';
import { addNumbersTool } from '../../src/tools/add-numbers.tool';

export interface AgentScenario {
  name: string;
  goal: string;
  decisions: readonly unknown[];
  grantedPermissions?: string[];
  maxIterations?: number;
  expected: {
    terminal:
      | { result: string; observations: ToolObservation[] }
      | { code: AgentRunErrorCode };
    toolCalls: { name: string; arguments: unknown }[];
    // Observations actually sent to the model before each scripted decision.
    observationsByDecision: ToolObservation[][];
    decisionCount: number;
  };
}

export async function evaluateScenario(scenario: AgentScenario): Promise<void> {
  const states: AgentState[] = [];
  let scriptExhausted = false;
  const provider: ModelProvider = {
    generateStructured<T>(request: StructuredGenerationRequest<T>): Promise<T> {
      const input = JSON.parse(request.input) as { state: unknown };
      states.push(AgentStateSchema.parse(input.state));
      const index = states.length - 1;
      if (index >= scenario.decisions.length) {
        scriptExhausted = true;
        throw new Error('Evaluation script exhausted');
      }
      return Promise.resolve(request.schema.parse(scenario.decisions[index]));
    },
  };
  const registry = new ToolRegistry();
  registry.register(addNumbersTool);
  const executor = new ToolExecutor(registry);
  // Call-through spy: policy, validation and handler invocation remain real.
  const calls = jest.spyOn(executor, 'execute');
  const runner = new AgentRunner(new AgentDecisionService(provider), executor, {
    maxIterations: scenario.maxIterations,
  });
  const initial = { goal: scenario.goal, observations: [] };
  const run = runner.run(
    initial,
    registry.list().map(({ name, description }) => ({ name, description })),
    {
      permissions:
        scenario.grantedPermissions === undefined
          ? undefined
          : { grantedPermissions: scenario.grantedPermissions },
    },
  );
  try {
    if ('result' in scenario.expected.terminal) {
      const output = await run;
      expect(output).toEqual({
        result: scenario.expected.terminal.result,
        state: {
          goal: scenario.goal,
          observations: scenario.expected.terminal.observations,
        },
      });
    } else {
      await expect(run).rejects.toBeInstanceOf(AgentRunError);
      await expect(run).rejects.toMatchObject({
        code: scenario.expected.terminal.code,
        message: new AgentRunError(scenario.expected.terminal.code).message,
      });
    }
    expect(scriptExhausted).toBe(false);
    expect(states).toHaveLength(scenario.expected.decisionCount);
    expect(states.map((state) => state.goal)).toEqual(
      states.map(() => scenario.goal),
    );
    expect(states.map((state) => state.observations)).toEqual(
      scenario.expected.observationsByDecision,
    );
    expect(
      calls.mock.calls.map(([name, args]) => ({ name, arguments: args })),
    ).toEqual(scenario.expected.toolCalls);
    expect(initial.observations).toEqual([]);
  } finally {
    calls.mockRestore();
  }
}
