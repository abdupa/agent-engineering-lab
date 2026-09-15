import type { ToolObservation } from '../../src/agent/agent.schema';
import type { AgentScenario } from './evaluate';

const call = {
  type: 'tool_call' as const,
  toolName: 'add-numbers',
  arguments: { left: 2, right: 3 },
};
const transport = {
  decision: {
    type: 'tool_call',
    toolName: call.toolName,
    argumentsJson: '{"left":2,"right":3}',
  },
};
const finish = (result: string) => ({ decision: { type: 'finish', result } });
const toolCall = { name: call.toolName, arguments: call.arguments };
const success: ToolObservation = { status: 'success', call, result: 5 };
const denied: ToolObservation = { status: 'failure', call, code: 'DENIED' };
const invalidCall = { ...call, arguments: { left: 'two', right: 3 } };
const invalid: ToolObservation = {
  status: 'failure',
  call: invalidCall,
  code: 'INVALID_INPUT',
};

export const scenarios: AgentScenario[] = [
  {
    name: 'immediate finish',
    goal: 'Return ready',
    decisions: [finish('ready')],
    expected: {
      terminal: { result: 'ready', observations: [] },
      toolCalls: [],
      observationsByDecision: [[]],
      decisionCount: 1,
    },
  },
  {
    name: 'addition then finish',
    goal: 'Add 2 and 3',
    decisions: [transport, finish('5')],
    grantedPermissions: ['calculate'],
    expected: {
      terminal: { result: '5', observations: [success] },
      toolCalls: [toolCall],
      observationsByDecision: [[], [success]],
      decisionCount: 2,
    },
  },
  {
    name: 'permission denial observed before finish',
    goal: 'Attempt addition and report denial',
    decisions: [transport, finish('Permission denied')],
    expected: {
      terminal: { result: 'Permission denied', observations: [denied] },
      toolCalls: [toolCall],
      observationsByDecision: [[], [denied]],
      decisionCount: 2,
    },
  },
  {
    name: 'invalid tool input observed before finish',
    goal: 'Report invalid addition input',
    decisions: [
      {
        decision: {
          ...transport.decision,
          argumentsJson: '{"left":"two","right":3}',
        },
      },
      finish('Invalid input'),
    ],
    grantedPermissions: ['calculate'],
    expected: {
      terminal: { result: 'Invalid input', observations: [invalid] },
      toolCalls: [{ name: call.toolName, arguments: invalidCall.arguments }],
      observationsByDecision: [[], [invalid]],
      decisionCount: 2,
    },
  },
  {
    name: 'loop exhaustion without forced final decision',
    goal: 'Keep adding',
    decisions: [transport, transport],
    maxIterations: 2,
    grantedPermissions: ['calculate'],
    expected: {
      terminal: { code: 'LOOP_LIMIT' },
      toolCalls: [toolCall, toolCall],
      observationsByDecision: [[], [success]],
      decisionCount: 2,
    },
  },
  {
    name: 'malformed argument JSON terminates translation',
    goal: 'Attempt malformed arguments',
    decisions: [{ decision: { ...transport.decision, argumentsJson: '{' } }],
    expected: {
      terminal: { code: 'DECISION_FAILED' },
      toolCalls: [],
      observationsByDecision: [[]],
      decisionCount: 1,
    },
  },
];
