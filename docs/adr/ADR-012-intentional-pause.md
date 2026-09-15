# ADR-012 — Intentional pause suspends execution time

Status: Accepted

## Decision

V0.4-004 introduces pure pauseOrchestration and resumePausedOrchestration helpers.
A strict version-1 control: paused envelope holds orchestration state, consumed/max
iterations and positive remainingExecutionMs. It holds no absolute deadline or
runtime context. Only awaiting_decision with remaining iterations can pause. The
trusted application caller must ensure no advance or underlying work is in flight.

At pause, remainingExecutionMs = deadlineEpochMs - nowEpochMs, requiring positive
remaining time. On explicit resume, deadlineEpochMs = nowEpochMs + remainingExecutionMs.
Both clocks and resulting deadline must be non-negative safe integer milliseconds.
If 37000 ms remained, exactly 37000 ms remain after resume irrespective of paused
wall time. Repeated pauses preserve only the new remainder, never a full budget.
Consumed iterations and maximum are unchanged. Fresh execution context is required
by the existing resume validator and never placed in checkpoint data. ToolExecutor
remains authoritative for actual permission enforcement.

The separate envelope is deliberately incompatible with CheckpointSchema, so
Orchestrator.advance rejects it until explicitly resumed. Existing phase transitions,
AgentState, ModelProvider, ToolExecutor, ToolRegistry and AgentRunner are unchanged.
Completed/failed states cannot pause or resume; cancellation stays terminal.
Pending tools cannot pause and are not replayed. Helpers throw fixed safe Error
messages for invalid operations, without adding a new error framework.

## Distinctions and limits

Pause is not an ordinary checkpoint: ordinary checkpoint wall time still counts
under ADR-010. Only explicit intentional pause suspends execution time. Pause is
not cancellation; an interrupt need not be a failure; resume is not retry. Execution
budget is distinct from wall-clock pause duration. This supersedes the previous
deferral of intentional-pause time semantics only, not ordinary checkpoint policy.

State is logical serializable data, not durable storage. Caller-supplied timestamps
and state are trusted; schema checks cannot establish quiescence, authenticity or
freshness. The caller must discard old active snapshots while paused. Replay or
concurrent use of old checkpoints is not prevented. No pause expiration policy,
identity, approver, RBAC, notification, workflow, UI, storage, LangGraph or ambiguous
effect recovery is added. Nested domain data is not a secret redactor; trusted
producers must exclude credentials and runtime objects. Resume performs no model
or tool work; the caller must supply fresh context again to advance.
