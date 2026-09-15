import { prepareCheckpointResume, restoreCheckpoint } from './checkpoint';
import type { ToolPermissionContext } from '../tools/tool';

const base = {
  version: 1,
  state: {
    phase: 'awaiting_decision',
    agentState: { goal: 'Add', observations: [] },
  },
  iterationsConsumed: 2,
  maxIterations: 6,
  deadlineEpochMs: 10000,
};
const permissions = { grantedPermissions: ['calculate'] };
describe('Checkpoint semantics', () => {
  it('restores a JSON checkpoint as an independent validated copy', () => {
    const restored = restoreCheckpoint(JSON.parse(JSON.stringify(base)));
    expect(restored).toEqual(base);
    restored.state.agentState.goal = 'Changed';
    expect(base.state.agentState.goal).toBe('Add');
  });
  it('preserves budgets and excludes fresh permissions from returned state', () => {
    const resumed = prepareCheckpointResume(base, 9999, permissions);
    expect(resumed).toEqual(base);
    expect(resumed).not.toHaveProperty('permissions');
    expect(() => prepareCheckpointResume(resumed, 10000, permissions)).toThrow(
      'Checkpoint cannot resume',
    );
  });
  it.each(['completed', 'failed', 'awaiting_tool_result'])(
    'restores %s for inspection only',
    (phase) => {
      const state = {
        agentState: base.state.agentState,
        phase,
        ...(phase === 'completed'
          ? { result: '5' }
          : phase === 'failed'
            ? { code: 'INTERNAL' }
            : {
                pendingCall: {
                  type: 'tool_call',
                  toolName: 'add-numbers',
                  arguments: { left: 2, right: 3 },
                },
              }),
      };
      const checkpoint = { ...base, state };
      expect(restoreCheckpoint(checkpoint).state.phase).toBe(phase);
      expect(() => prepareCheckpointResume(checkpoint, 1, permissions)).toThrow(
        'Checkpoint cannot resume',
      );
    },
  );
  it.each([10000, 10001, -1, NaN, Infinity, 1.5])(
    'rejects expired deadline or invalid clock %s',
    (now) => {
      expect(() => prepareCheckpointResume(base, now, permissions)).toThrow(
        'Checkpoint cannot resume',
      );
    },
  );
  it('rejects exhausted iterations without resetting them', () => {
    expect(() =>
      prepareCheckpointResume(
        { ...base, iterationsConsumed: 6 },
        1,
        permissions,
      ),
    ).toThrow('Checkpoint cannot resume');
  });
  it.each([
    undefined,
    {},
    { grantedPermissions: [' '] },
    { grantedPermissions: [1] },
  ])('requires explicit fresh permission context %#', (context) => {
    expect(() =>
      prepareCheckpointResume(base, 1, context as ToolPermissionContext),
    ).toThrow('Checkpoint cannot resume');
  });
  it('allows explicit empty grants without granting tool permissions', () => {
    expect(
      prepareCheckpointResume(base, 1, { grantedPermissions: [] }),
    ).toEqual(base);
  });
  it.each([
    { ...base, version: 2 },
    { ...base, version: undefined },
    { ...base, iterationsConsumed: -1 },
    { ...base, iterationsConsumed: 7 },
    { ...base, maxIterations: 0 },
    { ...base, deadlineEpochMs: Infinity },
    { ...base, permissions },
    { ...base, token: 'private' },
    { ...base, state: { ...base.state, client: {} } },
    { ...base, state: { phase: 'unknown' } },
  ])('rejects invalid checkpoint safely %#', (data) => {
    expect(() => restoreCheckpoint(data)).toThrow(
      new Error('Invalid checkpoint'),
    );
  });
});
