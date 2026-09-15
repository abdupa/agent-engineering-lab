import { z } from 'zod';
import type { ToolPermissionContext } from '../tools/tool';
import { OrchestrationStateSchema } from './orchestration';
import { prepareCheckpointResume, restoreCheckpoint } from './checkpoint';
import type { Checkpoint } from './checkpoint';

const integer = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const PausedOrchestrationSchema = z
  .strictObject({
    version: z.literal(1),
    control: z.literal('paused'),
    state: OrchestrationStateSchema,
    iterationsConsumed: integer,
    maxIterations: integer.min(1),
    remainingExecutionMs: integer.min(1),
  })
  .refine(
    (value) =>
      value.state.phase === 'awaiting_decision' &&
      value.iterationsConsumed < value.maxIterations,
  );
export type PausedOrchestration = z.infer<typeof PausedOrchestrationSchema>;

/** Trusted caller must establish that no advance or underlying work is in flight. */
export function pauseOrchestration(
  data: unknown,
  nowEpochMs: number,
): PausedOrchestration {
  try {
    const checkpoint = restoreCheckpoint(data);
    if (!Number.isSafeInteger(nowEpochMs) || nowEpochMs < 0) throw new Error();
    return PausedOrchestrationSchema.parse({
      version: 1,
      control: 'paused',
      state: checkpoint.state,
      iterationsConsumed: checkpoint.iterationsConsumed,
      maxIterations: checkpoint.maxIterations,
      remainingExecutionMs: checkpoint.deadlineEpochMs - nowEpochMs,
    });
  } catch {
    throw new Error('Orchestration cannot pause');
  }
}

/** Explicit application action; context is checked, never placed in returned data. */
export function resumePausedOrchestration(
  data: unknown,
  nowEpochMs: number,
  context: ToolPermissionContext,
): Checkpoint {
  try {
    const paused = PausedOrchestrationSchema.parse(data);
    if (!Number.isSafeInteger(nowEpochMs) || nowEpochMs < 0) throw new Error();
    return prepareCheckpointResume(
      {
        version: 1,
        state: paused.state,
        iterationsConsumed: paused.iterationsConsumed,
        maxIterations: paused.maxIterations,
        deadlineEpochMs: nowEpochMs + paused.remainingExecutionMs,
      },
      nowEpochMs,
      context,
    );
  } catch {
    throw new Error('Paused orchestration cannot resume');
  }
}
