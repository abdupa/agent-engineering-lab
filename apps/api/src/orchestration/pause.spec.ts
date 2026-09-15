import { pauseOrchestration, resumePausedOrchestration } from './pause';
import { restoreCheckpoint } from './checkpoint';
import { Orchestrator } from './orchestrator';
import type { ToolPermissionContext } from '../tools/tool';

const checkpoint = {
  version: 1,
  state: {
    phase: 'awaiting_decision',
    agentState: { goal: 'Add', observations: [] },
  },
  iterationsConsumed: 2,
  maxIterations: 6,
  deadlineEpochMs: 40000,
};
const context = { grantedPermissions: ['calculate'] };
describe('Intentional pause', () => {
  it('preserves exactly 37 seconds across arbitrary paused wall time', () => {
    const paused = pauseOrchestration(checkpoint, 3000);
    expect(paused.remainingExecutionMs).toBe(37000);
    expect(paused).not.toHaveProperty('deadlineEpochMs');
    const resumed = resumePausedOrchestration(
      JSON.parse(JSON.stringify(paused)),
      1000000,
      context,
    );
    expect(resumed).toEqual({ ...checkpoint, deadlineEpochMs: 1037000 });
    expect(resumed).not.toHaveProperty('grantedPermissions');
    expect(checkpoint.deadlineEpochMs).toBe(40000);
  });
  it('does not replenish time across repeated pauses', () => {
    const resumed = resumePausedOrchestration(
      pauseOrchestration(checkpoint, 3000),
      100000,
      context,
    );
    expect(pauseOrchestration(resumed, 110000).remainingExecutionMs).toBe(
      27000,
    );
  });
  it('does not advance or restore a pause as an ordinary checkpoint', async () => {
    const decide = jest.fn();
    const execute = jest.fn();
    const paused = pauseOrchestration(checkpoint, 0);
    expect(() => restoreCheckpoint(paused)).toThrow('Invalid checkpoint');
    await expect(
      new Orchestrator({ decide }, { execute }).advance(paused, [], context),
    ).rejects.toThrow('Invalid checkpoint');
    expect(decide).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });
  it.each(['completed', 'failed', 'awaiting_tool_result'])(
    'rejects pause/resume of %s',
    (phase) => {
      const state = {
        agentState: checkpoint.state.agentState,
        phase,
        ...(phase === 'completed'
          ? { result: '5' }
          : phase === 'failed'
            ? { code: 'CANCELLED' }
            : {
                pendingCall: {
                  type: 'tool_call',
                  toolName: 'add',
                  arguments: {},
                },
              }),
      };
      expect(() => pauseOrchestration({ ...checkpoint, state }, 0)).toThrow(
        'Orchestration cannot pause',
      );
      expect(() =>
        resumePausedOrchestration(
          { ...pauseOrchestration(checkpoint, 0), state },
          0,
          context,
        ),
      ).toThrow('Paused orchestration cannot resume');
    },
  );
  it.each([40000, 40001, -1, NaN, Infinity, 1.5])(
    'rejects expired/invalid pause time %s',
    (now) => {
      expect(() => pauseOrchestration(checkpoint, now)).toThrow(
        'Orchestration cannot pause',
      );
    },
  );
  it('rejects exhausted iterations', () => {
    expect(() =>
      pauseOrchestration({ ...checkpoint, iterationsConsumed: 6 }, 0),
    ).toThrow('Orchestration cannot pause');
  });
  it.each([undefined, {}, { grantedPermissions: [' '] }])(
    'requires fresh valid context %#',
    (permissions) => {
      expect(() =>
        resumePausedOrchestration(
          pauseOrchestration(checkpoint, 0),
          0,
          permissions as ToolPermissionContext,
        ),
      ).toThrow('Paused orchestration cannot resume');
    },
  );
  it.each([
    { version: 2 },
    { remainingExecutionMs: 0 },
    { deadlineEpochMs: 1 },
    { credentials: 'private' },
    { remainingExecutionMs: Infinity },
  ])('rejects invalid pause envelope %#', (extra) => {
    expect(() =>
      resumePausedOrchestration(
        { ...pauseOrchestration(checkpoint, 0), ...extra },
        0,
        context,
      ),
    ).toThrow('Paused orchestration cannot resume');
  });
  it('rejects deadline overflow', () => {
    expect(() =>
      resumePausedOrchestration(
        pauseOrchestration(checkpoint, 0),
        Number.MAX_SAFE_INTEGER,
        context,
      ),
    ).toThrow('Paused orchestration cannot resume');
  });
});
