# ADR-010 — Conservative checkpoint and resume semantics

Status: Accepted

## Decision

V0.4-002 defines a strict checkpoint envelope containing version: 1, existing
orchestration state, iterationsConsumed, maxIterations and deadlineEpochMs. Counts
are non-negative safe integers, the maximum is positive and consumed cannot exceed
maximum. The absolute deadline is Unix epoch milliseconds. Version 1 identifies
these semantics explicitly; unsupported versions are rejected rather than guessed.
No checkpoint ID, storage location or runtime object is needed.

restoreCheckpoint validates unknown data and returns a parsed copy for inspection.
Invalid data produces a fixed Invalid checkpoint Error without raw details.
prepareCheckpointResume additionally requires awaiting_decision, remaining
iterations, a valid caller-supplied current epoch time strictly before the original
deadline and an explicit fresh permission context. It returns the unchanged budgets
and validated state, not a running execution. Failed eligibility produces the fixed
Checkpoint cannot resume Error. The clock argument makes checks deterministic.

Only a quiescent awaiting_decision boundary is automatically resumable. The future
orchestrator must establish that no work is in flight before capturing it; schema
validation cannot prove quiescence or authenticity. completed and failed are
inspection-only, even if budgets remain. awaiting_tool_result is inspection-only:
a tool may have had effects before its observation was recorded. Never automatically
repeat its pending call. Ambiguous-effect recovery requires a later justified design.

Consumed iterations are preserved, not derived from observation count. Future
execution must account for decisions already started and continue using the same
maximum. It must retain the original absolute deadline and recheck it during
execution. Wall-clock time while checkpointed counts. A clock rollback can affect
this wall-clock policy; no trusted-clock guarantee is claimed. Intentional human
pause semantics may later need active-execution versus suspended-time accounting;
that policy is not designed here. Existing AgentRunner remains unchanged and must
not be used to resume by resetting its constructor budgets.

## Authorization and limits

Checkpoint metadata contains no permission grants, auth state, credentials, tokens,
handlers, signals, clients, executors or loggers. Fresh caller context is checked
only for presence/shape and is not returned inside the checkpoint. Empty grants
are valid context, not permission to run any tool. ToolExecutor remains authoritative
for required grants. The caller must pass fresh context to future execution; this
helper cannot prove its freshness or authorize callers.

Nested domain strings/arguments/results are not secret-redacted; trusted producers
must exclude credentials and auth data from them. Existing nested schema projection
is preserved. Schemas do not establish history provenance, protect against forged
budgets or provide a hostile-object sandbox. Checkpoint construction must capture
validated state and budgets together at a safe boundary; no storage/save operation
is implemented. ModelProvider, ToolExecutor, AgentState and transitions are unchanged.

No durable persistence, crash-safe storage, concurrent-resume protection, replay
protection, exactly-once execution or ambiguous-effect recovery is claimed. There
is no storage adapter, tool execution during restoration, framework, lock, retry,
interrupt, queue or idempotency infrastructure. V0.4-003 owns orchestration and
LangGraph evaluation under these semantics.
