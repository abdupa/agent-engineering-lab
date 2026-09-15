import {
  AgentDecisionSchema,
  AgentStateSchema,
  ToolObservationSchema,
} from './agent.schema';

const call = {
  type: 'tool_call',
  toolName: 'add-numbers',
  arguments: { left: 2, right: 3 },
};

describe('Agent domain contracts', () => {
  it('parses finish text and strips unrelated fields', () => {
    expect(
      AgentDecisionSchema.parse({
        type: 'finish',
        result: ' Done ',
        rawError: 'private',
      }),
    ).toEqual({ type: 'finish', result: 'Done' });
  });
  it('preserves structured nested JSON object arguments', () => {
    const arguments_ = {
      nested: { values: [null, true, 1, 'text', { empty: {} }] },
    };
    expect(
      AgentDecisionSchema.parse({
        ...call,
        toolName: ' example ',
        arguments: arguments_,
      }),
    ).toEqual({ ...call, toolName: 'example', arguments: arguments_ });
  });
  it.each([
    {},
    { type: 'other' },
    { type: 'finish', result: ' ' },
    { type: 'finish', result: 4 },
    { ...call, toolName: '' },
    { ...call, arguments: [] },
    { ...call, arguments: null },
    { ...call, arguments: '{"left":2}' },
    { ...call, arguments: { bad: undefined } },
    { ...call, arguments: { bad: Infinity } },
    { ...call, arguments: { bad: () => 1 } },
  ])('rejects invalid decision %#', (value) => {
    expect(AgentDecisionSchema.safeParse(value).success).toBe(false);
  });
  it.each([null, false, 0, 'text', [], { nested: [1, null] }])(
    'accepts JSON-compatible success result %#',
    (result) => {
      expect(
        ToolObservationSchema.parse({ status: 'success', call, result }),
      ).toEqual({ status: 'success', call, result });
    },
  );
  it.each([
    'NOT_FOUND',
    'DENIED',
    'INVALID_INPUT',
    'EXECUTION_FAILED',
    'INVALID_OUTPUT',
    'TIMEOUT',
  ])('accepts existing safe failure %s', (code) => {
    expect(
      ToolObservationSchema.parse({ status: 'failure', call, code }),
    ).toEqual({ status: 'failure', call, code });
  });
  it.each([
    { status: 'success', call },
    { status: 'success', call, result: NaN },
    { status: 'success', call, result: new Error('private') },
    { status: 'failure', call, code: 'UNKNOWN' },
    {
      status: 'failure',
      call: { type: 'finish', result: 'done' },
      code: 'DENIED',
    },
  ])('rejects invalid observation %#', (value) => {
    expect(ToolObservationSchema.safeParse(value).success).toBe(false);
  });
  it('preserves observation order and excludes envelope internals', () => {
    const success = { status: 'success', call, result: 5 };
    const failure = { status: 'failure', call, code: 'DENIED' };
    expect(
      AgentStateSchema.parse({
        goal: ' Calculate ',
        observations: [
          {
            ...success,
            handler: () => 1,
            grantedPermissions: ['secret'],
            signal: new AbortController().signal,
          },
          { ...failure, error: new Error('private'), logs: ['private'] },
        ],
        provider: 'private',
        stepBudget: 4,
      }),
    ).toEqual({ goal: 'Calculate', observations: [success, failure] });
  });
  it('accepts an initial state without observations', () => {
    expect(AgentStateSchema.parse({ goal: 'Task', observations: [] })).toEqual({
      goal: 'Task',
      observations: [],
    });
  });
  it.each([
    { goal: '', observations: [] },
    { goal: 'Task' },
    { goal: 'Task', observations: {} },
  ])('rejects invalid state %#', (state) => {
    expect(AgentStateSchema.safeParse(state).success).toBe(false);
  });
});
