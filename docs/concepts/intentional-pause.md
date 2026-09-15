# Intentional pause and continuing execution time

[pauseOrchestration and resumePausedOrchestration](../../apps/api/src/orchestration/pause.ts)
provide explicit application control between advances. Only awaiting_decision with
no in-flight work may pause. The trusted caller establishes quiescence; no locking
or running-operation registry is introduced.

A pause replaces the absolute deadline with remainingExecutionMs. For example,
pausing with 37 seconds remaining and resuming an hour later gives 37 seconds of
continuing execution time. Iterations consumed and maximum never reset. Ordinary
checkpoints continue to lose wall-clock time as before. Resume requires fresh
permissions; those permissions are never stored and do not bypass ToolExecutor.

The paused envelope cannot be restored as an ordinary checkpoint or advanced.
Explicit resume validates it and returns a checkpoint with a continuing deadline.
Completed, failed and pending-tool states are rejected. Cancellation remains a
terminal failure, not a pause. No model or tool is invoked by either helper.

The key concept is separating active execution budget from intentionally suspended
time. Pause is not checkpoint, cancellation or retry; interrupt is not necessarily
failure. Logical snapshots cannot prevent a caller from reusing an old checkpoint.
No durable pause storage, replay/concurrency protection, identity/approval workflow,
notifications, expiration policy or UI is provided. See
[ADR-012](../adr/ADR-012-intentional-pause.md).
