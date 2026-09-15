# v0.4 — Stateful Agent Orchestration

Status: Released (2026-09-14).

V0.4-007 records release closure and v0.5 planning. This repository release record
does not imply production deployment or durable execution infrastructure.

## Goal and delivered architecture

Make execution progress, continuation and intentional pause explicit while preserving
ModelProvider, ToolExecutor and provider-neutral AgentState boundaries.

```text
Application -> Orchestrator.advance -> AgentDecisionService -> ModelProvider
                                   -> ToolExecutor -> ToolRegistry
Application -> pure checkpoint/restore and intentional pause/resume helpers
Orchestrator -> pure state transitions -> logical checkpoint
```

| Milestone | Delivered                                                                        |
| --------- | -------------------------------------------------------------------------------- |
| V0.4-001  | Phase-discriminated orchestration state and pure validated transitions           |
| V0.4-002  | Versioned logical checkpoint contracts and conservative resume eligibility       |
| V0.4-003  | One complete iteration per advance and custom orchestration/LangGraph comparison |
| V0.4-004  | Intentional pause/resume preserving remaining active time                        |
| V0.4-005  | Safe correlated completion diagnostics and logical recovery integration tests    |
| V0.4-006  | Architecture review and implementation-linked mastery exercises                  |

State variants are awaiting_decision, awaiting_tool_result, completed and failed.
Each contains existing AgentState; only the appropriate variant has a pending call,
completion result or safe failure code. Pure transitions enforce canonical call
matching before appending observations. Tools execute only through ToolExecutor;
success observations contain validated results and failures contain safe codes.

Restoration validates a snapshot for inspection, not permission to execute. Only
awaiting_decision with remaining budgets and fresh context is resumable. Pending
tool effects may already have occurred, so awaiting_tool_result never automatically
resumes or replays. Terminal restoration is inspection-only.

Caller-driven advance makes one decision and at most one controlled tool call.
It returns completed, failed or awaiting_decision. Consumed iterations and maximum
are preserved. Ordinary checkpoints retain the original absolute deadline, so time
between advances counts. Intentional pause stores only remaining active execution
time; paused wall-clock time does not count. Resume establishes a continuing deadline
from that remainder, never a fresh full budget. Fresh permissions remain outside
stored state and ToolExecutor remains authoritative. AgentRunner is unchanged.

One safe orchestration_advance completion event records correlation when available,
duration, outcome, validated phase/count and safe failure category. Payloads, grants
and raw errors are excluded. Logging cannot change execution results. Pure helpers
remain free of logging effects.

## Verification, review and framework decision

370 automated tests in 20 suites passed at release transition. Formatting,
format:check, lint, typecheck, build and git diff --check passed. HTTP regressions
used localhost sockets. No live AI request was required or made.

Tests cover state invariants, serialization/restoration, preserved budgets,
ordinary deadline expiration, intentional paused time, fresh grants, terminal and
pending-tool rejection, and late decision/tool completion after cancellation or
timeout. Late work cannot change settled orchestration snapshots or emit a second
advance completion event. This is logical recovery evidence, not crash recovery.

[ADR-011](../../adr/ADR-011-single-iteration-orchestration.md) compares the implemented
custom advance path with documented LangGraph capabilities. Custom orchestration
was retained because current control flow is small and a framework would not remove
validation, permission or effect-safety obligations. No LangGraph dependency or
prototype was needed; this was not a performance benchmark.

[REVIEW.md](REVIEW.md) found no clear violation requiring runtime correction and
records the maintenance cost of separate v0.3/v0.4 execution paths.
[MASTERY.md](MASTERY.md) supplies learning questions without claiming learner mastery.

## Limitations and deliberately deferred capabilities

Logical checkpoints are not durable persistence. There is no crash-safe checkpoint
store, replay protection, concurrent-resume protection, distributed locking,
automatic ambiguous-effect recovery or distributed execution. awaiting_tool_result
cannot automatically resume. Callers establish safe pause boundaries with no work
in flight and must not reuse old active snapshots.

Cancellation is cooperative; underlying provider/tool work may continue after
orchestration settles. Synchronous work cannot be preempted. Logs are best-effort
diagnostics, not durable audit storage. Trusted clocks, history and registration
are not authenticated by schema validation. No live model reasoning-quality
evaluation or exactly-once effects are claimed.

No agent HTTP endpoint, durable pause storage, approval system, UI, notifications,
queues, RAG, long-term memory or multi-agent behavior is added. Storage and stronger
effect guarantees need explicit later requirements. Active development moves to
[v0.5 — Retrieval Engineering](../v0.5/SPEC.md); no v0.5 implementation starts here.
