# ADR-011 — Caller-driven single-iteration orchestration

Status: Accepted

## Decision and concrete implementation

Orchestrator.advance accepts unknown checkpoint data, handler-free descriptions,
fresh permission context and optional AbortSignal. It validates an independent
checkpoint copy, counts one started decision, invokes AgentDecisionService's decide
surface, validates the canonical decision and uses existing pure transitions.
Finish returns completed. Tool calls execute only through ToolExecutor; validated
success or safe failure observations return awaiting_decision. No pending-tool
checkpoint is returned for automatic resumption. Exhausted budget fails on the next
advance attempt without a model call; finish on the final allowed decision succeeds.

Absolute deadline and consumed/max iterations are preserved. A timer bounds waiting;
stage checks suppress late decisions/actions/observations. Caller cancellation and
deadline take precedence over other execution failures, as in AgentRunner. Existing
safe agent codes become terminal failed checkpoints, clearing pending calls.
Terminal input is returned for inspection only. Malformed checkpoint input rejects
with Invalid checkpoint because no valid domain state exists to return. Restored
pending-tool input becomes failed INVALID_INPUT without invocation. Fresh grants
are copied outside state; ToolExecutor remains authoritative. AgentRunner is unchanged.

No hard cancellation is claimed: in-flight work can continue under its own policy.
Snapshots are neither durable nor concurrency/replay protected. The caller drives
subsequent advances and must not replay old snapshots. Wall-clock rollback remains
an existing deadline limitation. No new logging platform or orchestration logging
schema is introduced; underlying provider/tool logging remains, while orchestration
observability is V0.4-005.

## LangGraph.js evaluation

Compared after implementing the custom advance path, using official documentation
reviewed 2026-09-14. No dependency or prototype was needed to establish the current
scope tradeoff. This is a design comparison, not measured framework performance.

The [Graph API](https://docs.langchain.com/oss/javascript/langgraph/graph-api)
models nodes, edges and state updates, supports conditional routing and visualization.
That can clarify larger graphs. Here one decision branch and one tool step already
have explicit domain transitions; adding nodes/reducers would wrap or duplicate them.
Our judgment is that it adds little clarity to this particular advance operation.
Deterministic fake-provider testing works with either approach, but a framework
would add compilation/runtime configuration to the existing focused tests.

[Persistence](https://docs.langchain.com/oss/javascript/langgraph/persistence)
provides checkpointer-based state snapshots and thread-oriented execution. That is
useful when checkpoint infrastructure is required. Our versioned logical snapshots
and conservative resume gate would still need adaptation and validation; adopting
framework checkpoint behavior does not establish our tool-effect safety guarantees.
Storage integration is outside this task.

[Interrupts](https://docs.langchain.com/oss/javascript/langgraph/interrupts) support
pause and resume, with node restart on resumption and cautions about side effects.
This offers potential future HITL value, but human interrupts are out of scope and
would require explicit compatibility with our refusal to replay pending tool calls.
Framework observability/streaming can expose execution structure; safe allowlisted
logging would still need deliberate configuration to avoid collecting domain payloads.

Keep custom orchestration for now: its maintainability cost is a small explicit
advance path alongside the deliberately preserved v0.3 runner. LangGraph would add
a dependency, state-update adaptation and coupling without removing budget, permission,
validation or cancellation obligations. Nodes could call our existing interfaces,
so boundary bypass is not intrinsic to LangGraph; convenience model/tool integrations
must not replace ModelProvider or ToolExecutor. Do not reshape domain contracts to
fit framework APIs. Re-evaluate when concrete interrupt/checkpointer requirements
justify the integration cost. No RAG, memory, queues or framework storage is added.

## V0.4-005 — Advance completion boundary

An outer advance wrapper records one safe correlated completion event for every
call, including invalid-input rejection and terminal inspection. The inner execution
path retains its policies and cleanup. Returned validated state supplies only phase,
consumed count and safe failure category; rejected input contributes no state fields.
Logger failure is swallowed so diagnostics do not affect semantics. The field and
outcome definitions are in [orchestration observability](../concepts/orchestration-observability.md).
Checkpoint, pause/resume and transition helpers remain pure. Separate pause/restore
events are deferred until an application boundary owns those operations. Tests prove
logical continuation and suppression of late state effects, not durable recovery or
underlying cancellation. No new dependency or observability contract parameter added.
