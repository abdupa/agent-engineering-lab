import {
  OrchestrationStateSchema,
  transitionOrchestration,
} from './orchestration';
import type { OrchestrationEvent, OrchestrationState } from './orchestration';

const agentState = { goal: 'Add', observations: [] };
const call = {
  type: 'tool_call' as const,
  toolName: 'add-numbers',
  arguments: { left: 2, right: 3 },
};
const ready: OrchestrationState = { phase: 'awaiting_decision', agentState };
const pending: OrchestrationState = {
  phase: 'awaiting_tool_result',
  agentState,
  pendingCall: call,
};
const completed: OrchestrationState = {
  phase: 'completed',
  agentState,
  result: '5',
};
const failed: OrchestrationState = {
  phase: 'failed',
  agentState,
  code: 'INTERNAL',
};
const finish: OrchestrationEvent = {
  type: 'decision',
  decision: { type: 'finish', result: ' 5 ' },
};

describe('Orchestration contracts', () => {
  it.each([ready, pending, completed, failed])(
    'round-trips $phase as JSON',
    (state) => {
      expect(
        OrchestrationStateSchema.parse(JSON.parse(JSON.stringify(state))),
      ).toEqual(state);
    },
  );
  it.each([
    { ...ready, pendingCall: call },
    { ...ready, result: '5' },
    { ...ready, code: 'INTERNAL' },
    { ...pending, pendingCall: undefined },
    { ...pending, result: '5' },
    { ...pending, code: 'INTERNAL' },
    { ...completed, pendingCall: call },
    { ...completed, result: ' ' },
    { ...completed, code: 'INTERNAL' },
    { ...failed, pendingCall: call },
    { ...failed, result: '5' },
    { ...failed, code: 'RAW_ERROR' },
    { ...ready, logger: {} },
    {
      ...pending,
      pendingCall: { ...call, arguments: { value: new Error('secret') } },
    },
  ])('rejects contradictory or invalid state %#', (state) => {
    expect(OrchestrationStateSchema.safeParse(state).success).toBe(false);
  });
  it('finishes with validated text', () => {
    expect(transitionOrchestration(ready, finish)).toEqual(completed);
  });
  it('stores a canonical pending call', () => {
    expect(
      transitionOrchestration(ready, { type: 'decision', decision: call }),
    ).toEqual(pending);
  });
  it.each(['success', 'failure'] as const)(
    'appends a matching %s observation without mutation',
    (status) => {
      const observation =
        status === 'success'
          ? { status, call, result: 5 }
          : { status, call, code: 'DENIED' as const };
      const original = JSON.stringify(pending);
      const result = transitionOrchestration(pending, {
        type: 'observation',
        observation,
      });
      expect(result).toEqual({
        phase: 'awaiting_decision',
        agentState: { ...agentState, observations: [observation] },
      });
      result.agentState.observations.length = 0;
      expect(JSON.stringify(pending)).toBe(original);
      expect(observation.call).toEqual(call);
    },
  );
  it('compares object keys independently of insertion order', () => {
    expect(
      transitionOrchestration(pending, {
        type: 'observation',
        observation: {
          status: 'success',
          call: { ...call, arguments: { right: 3, left: 2 } },
          result: 5,
        },
      }).phase,
    ).toBe('awaiting_decision');
  });
  it.each([ready, pending])('accepts safe failure from $phase', (state) => {
    expect(
      transitionOrchestration(state, { type: 'failure', code: 'INTERNAL' }),
    ).toEqual(failed);
  });
  it.each([completed, failed])(
    'rejects every event from terminal $phase',
    (state) => {
      for (const event of [
        finish,
        { type: 'failure', code: 'TIMEOUT' },
        {
          type: 'observation',
          observation: { status: 'success', call, result: 5 },
        },
      ] as OrchestrationEvent[]) {
        expect(() => transitionOrchestration(state, event)).toThrow(
          'Invalid orchestration transition',
        );
      }
    },
  );
  it.each([
    { ...call, toolName: 'other' },
    { ...call, arguments: { left: 9, right: 3 } },
  ])('rejects an unrelated observation %#', (other) => {
    expect(() =>
      transitionOrchestration(pending, {
        type: 'observation',
        observation: { status: 'success', call: other, result: 5 },
      }),
    ).toThrow('Invalid orchestration transition');
  });
  it('rejects wrong-stage events and malformed data safely', () => {
    expect(() => transitionOrchestration(pending, finish)).toThrow(
      'Invalid orchestration transition',
    );
    expect(() =>
      transitionOrchestration(ready, {
        type: 'observation',
        observation: { status: 'success', call, result: 5 },
      }),
    ).toThrow('Invalid orchestration transition');
    expect(() =>
      transitionOrchestration(ready, {
        type: 'failure',
        code: 'secret',
      } as unknown as OrchestrationEvent),
    ).toThrow(new Error('Invalid orchestration transition'));
  });
});
