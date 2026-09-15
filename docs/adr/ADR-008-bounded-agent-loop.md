# ADR-008 — Bounded explicit agent loop

Status: Accepted

Date: 2026-09-13

## Decision

V0.3-003 introduces AgentRunner with constructor-configurable maxIterations (default 6) and timeoutMs (default 60000). One iteration makes one decision and, for a tool
call, at most one ToolExecutor invocation and one observation. Finish returns
immediately. Exhaustion rejects with LOOP_LIMIT without a forced final model call.

The runner accepts initial AgentState, handler-free descriptions, and optional
permissions/caller signal in run options. It returns result text and final state
on finish. It owns a parsed state copy and sends snapshots to decision generation.
Budgets are run control, not domain-state fields. The only dependencies are the
decide surface of AgentDecisionService and execute surface of ToolExecutor. No raw
handler, registry access, SDK type, or provider extension reaches the runner.

An absolute deadline starts at run entry and covers initial preparation, decisions
(including transport translation), tools, and observation handling. One timer races
the whole operation; elapsed-time checks guard stage transitions. Caller abort
stops waiting and prevents subsequent decisions/tools/observations. Timer and abort
listener are cleaned up on settlement. Existing ModelProvider and ToolExecutor
interfaces do not accept a caller cancellation signal, so they are not redesigned:
already started work may continue under its own existing policy.

Safe ToolExecutionError failures become failure observations containing the requested
call and code only. A later model decision may request another action within the
remaining budgets; the runner never retries automatically or deduplicates actions.
Successful observations use the result returned after ToolExecutor validation,
followed by JSON/domain observation validation. Non-JSON results terminate with
INTERNAL rather than recording raw or coerced data.

AgentRunError carries fixed safe messages and codes: INVALID_INPUT, DECISION_FAILED,
INVALID_DECISION, LOOP_LIMIT, TIMEOUT, CANCELLED, INTERNAL. Decision generation and
translation failures terminate; unexpected executor failures terminate. Raw errors,
causes, partial-state error payloads, and model/tool data are not attached. Detailed
agent diagnostics are V0.3-004, not this milestone.

## Tradeoffs and limits

An explicit for-loop makes the execution budget visible without a framework. A
whole-run deadline bounds accumulated waiting instead of resetting per step.
Stopping waiting is not hard cancellation: synchronous work cannot be preempted,
and in-flight SDK/tool operations may continue and emit their existing logs. Late
results are ignored by runner stage checks; no later tool is started after stopping.
The initial state and schema callbacks remain trusted acyclic data/code.

Permission grants are supplied by trusted application code outside model state.
Descriptions are projected to name/description, never handlers or permission grants.
Policy and tool-input validation remain in ToolExecutor. Returning a finish does
not prove factual accuracy or goal completion. No retry, forced-final-answer call,
planning framework, persistence, queue, memory, RAG, or multi-agent behavior is added.

## V0.3-004 — Safe terminal diagnostics

Preserve all run failure/continuation policies and add one final agent_run summary
using the existing ADR-004 logger and correlation approach. Capture requestId at
entry, count decision and executor calls started, and log monotonic duration,
outcome, and safe terminal code. Counts are per invocation and include pending or
failed operations. No goals, state, payloads, names, grants, or raw errors enter
these records. Safe tool failure followed by finish remains a successful run.

The catch boundary first applies the existing cancellation/deadline precedence,
then retains the same normalized error for caller and diagnostics. Cleanup precedes
best-effort logging, whose failure cannot replace execution results. No new failure
categories, retry, loop policy, context scope, run ID, or telemetry dependency is
needed. One settlement summary is sufficient for current run-level diagnostics;
step events and unique distributed operation identity are not claimed. Late work
cannot produce a duplicate runner summary. See
[agent run observability](../concepts/agent-run-observability.md) for field semantics
and delivery/privacy limitations.
