# Orchestration completion and recovery evidence

Each Orchestrator.advance call emits one best-effort orchestration_advance event
through existing Nest Logger and request context. Fields are event, optional
requestId, monotonic durationMs and outcome. A validated returned checkpoint adds
phase and iterationsConsumed. Failed state adds its existing safe code; rejected
invalid checkpoint input logs INVALID_INPUT without phase or count. Outcomes are
continued (awaiting_decision), completed, failure, and rejected. Terminal input is
inspection-only: its existing terminal outcome is reported without new execution.
A safe tool failure can still yield continued. Duration excludes log delivery.

No goals, state, observations, checkpoints, tool names/arguments, grants, prompts,
results, credentials or raw errors are logged. Logger exceptions cannot replace
results. Request correlation is not unique run identity or distributed tracing.
Helpers for checkpoints, transitions and intentional pause/resume remain pure;
dedicated pause/restore events await an owning application boundary.

Recovery tests compose advance with JSON serialization/restoration and explicit
pause/resume. They verify preserved counts and original checkpoint deadlines,
suspended intentional-pause time, fresh grants enforced by the real executor,
terminal non-execution, invalid input and pending-tool rejection. Existing contract
and checkpoint tests cover additional tampered data, exhausted budgets and missing
context. These are logical recovery tests, not durable crash recovery evidence.

For pending decision and tool work, tests settle cancellation/deadline first and
then allow the work to finish. Returned state remains unchanged, no late observation
is appended and no second advance completion event appears. This is suppression of
late effects on orchestration state, not guaranteed cancellation of underlying work.
Underlying provider/tool logs may still occur. No persistence, replay/concurrency
protection, audit guarantees, retries or telemetry infrastructure are introduced.
