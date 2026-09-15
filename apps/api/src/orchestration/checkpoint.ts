import { z } from 'zod';
import type { ToolPermissionContext } from '../tools/tool';
import { OrchestrationStateSchema } from './orchestration';

const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const CheckpointSchema = z
  .strictObject({
    version: z.literal(1),
    state: OrchestrationStateSchema,
    iterationsConsumed: count,
    maxIterations: count.min(1),
    deadlineEpochMs: count,
  })
  .refine((value) => value.iterationsConsumed <= value.maxIterations);
export type Checkpoint = z.infer<typeof CheckpointSchema>;

/** Validated copy for inspection, not execution or proof of trustworthy provenance. */
export function restoreCheckpoint(data: unknown): Checkpoint {
  try {
    return CheckpointSchema.parse(data);
  } catch {
    throw new Error('Invalid checkpoint');
  }
}

/** Checks eligibility only. The caller owns the clock and fresh execution context. */
export function prepareCheckpointResume(
  data: unknown,
  nowEpochMs: number,
  permissions: ToolPermissionContext,
): Checkpoint {
  const checkpoint = restoreCheckpoint(data);
  if (
    checkpoint.state.phase !== 'awaiting_decision' ||
    checkpoint.iterationsConsumed >= checkpoint.maxIterations ||
    !Number.isSafeInteger(nowEpochMs) ||
    nowEpochMs < 0 ||
    nowEpochMs >= checkpoint.deadlineEpochMs ||
    !permissions ||
    !Array.isArray(permissions.grantedPermissions) ||
    !permissions.grantedPermissions.every(
      (grant) =>
        typeof grant === 'string' &&
        grant.trim().length > 0 &&
        grant === grant.trim(),
    )
  )
    throw new Error('Checkpoint cannot resume');
  return checkpoint;
}
