# v0.4 — Stateful Agent Orchestration

Status: Released. V0.4-001 through V0.4-006 completed; V0.4-007 records release
closure and v0.5 planning in [RELEASE.md](RELEASE.md). See [REVIEW.md](REVIEW.md)
and [MASTERY.md](MASTERY.md) for evidence, limits and learning.

## Goal

Evolve the explicit custom loop into a stateful orchestration model that can persist
or checkpoint execution state, pause at defined boundaries, resume safely and make
execution flow explicit while preserving the boundaries learned in v0.1–v0.3.
Keep the release small and learning-driven.

Teach explicit workflow/agent state, nodes/steps, transitions and conditional
transitions; checkpoint concepts, pause/resume semantics, interrupts, resumability,
state restoration and safe continuation after interruption; orchestration
observability; and comparison of custom control flow with graph/state-machine
orchestration.

## Architecture direction

Current v0.3:

```text
AgentRunner -> AgentDecisionService (single-step) -> ModelProvider
AgentRunner -> ToolExecutor -> ToolRegistry
```

Potential v0.4:

```text
Orchestrator / Graph
  +-> decision step -> ModelProvider
  +-> tool execution step -> ToolExecutor -> ToolRegistry
  +-> state/checkpoint boundary
  +-> pause/resume/interrupt control
```

This is directional, not framework or storage implementation authorization.
ModelProvider remains the model boundary. ToolExecutor remains the only controlled
tool invocation boundary; no graph/node may invoke raw handlers or bypass permission
and input/output validation. Preserve provider-neutral domain contracts where
practical and deterministic validation around probabilistic decisions. Provider SDK
behavior stays behind ModelProvider, not in agent application logic.

## Directional tasks

| Task                                                               | Intended outcome                                                                                                                                |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| V0.4-001 — Orchestration state and transition contracts            | Define the smallest explicit runtime state and legal transition contracts, keeping domain state distinct from execution control.                |
| V0.4-002 — Checkpoint and resume semantics                         | Define checkpoint contents, save/restore boundaries, pause/resume guarantees and failure semantics before choosing storage.                     |
| V0.4-003 — Orchestration implementation and LangGraph evaluation   | Implement the justified orchestration model and evaluate custom control flow versus LangGraph.js; record the selection and tradeoffs in an ADR. |
| V0.4-004 — Interrupt and human-pause foundation                    | Establish explicit interrupt and continuation behavior without assuming a frontend, identity system or high-risk actions.                       |
| V0.4-005 — Stateful orchestration observability and recovery tests | Add safe execution diagnostics and deterministic evidence for restoration, interruption and recovery under the selected semantics.              |
| V0.4-006 — Orchestration review and mastery                        | Review architecture, guarantees, verification and limitations; create learning exercises before further evolution.                              |

Refine each task against requirements before implementation. These outcomes do not
silently decide state fields, transition events, checkpoint format or durability,
storage technology, identifiers/versioning, budget accounting across resume,
permission revalidation, interrupt authority, concurrent resume handling or effects
at crash boundaries. Resolve material missing decisions with the user and record
lasting decisions in ADRs. In particular, define how continuation avoids blindly
replaying tool effects and what an interrupted in-flight operation means; do not
claim exactly-once execution. Preserve existing behavior unless a task explicitly
authorizes a change. A planned task does not authorize the task after it.

## LangGraph decision

LangGraph.js is not automatically required. V0.4-003 must evaluate whether it adds
sufficient value for explicit state transitions, checkpointing, interrupts,
resumability, graph visualization/clarity and long-running workflow foundations.
Compare against the smallest custom orchestration that meets the settled requirements,
including added dependency, learning and integration costs. Any adoption requires
implementation-task justification and an ADR. Do not install it in this transition.
A framework must preserve ModelProvider, ToolExecutor and domain validation; graph
orchestration should clarify control flow rather than merely add complexity.

## Important distinctions

- Execution state describes progress in one workflow; it is not long-term semantic memory.
- A checkpoint records a defined continuation boundary; it is not merely a cache.
- Resume continues under an agreed restored state; it is not an automatic retry.
- An interrupt can be an intentional pause; it is not necessarily a failure.
- An orchestration framework implements control mechanics; it is not the business/domain architecture.
- Durable state does not automatically require a new microservice.

## Acceptance and verification direction

Demonstrate validated state transitions, checkpoint/restore and pause/resume under
explicitly selected guarantees, with controlled tool execution preserved. Test legal
and invalid transitions, interruptions, restoration and safe continuation
deterministically, including failure cases relevant to the selected checkpoint
semantics. Explain what survives process restart and what does not; do not equate
in-memory snapshots with durable persistence. Record cancellation and ambiguous
in-flight effect limitations honestly.

Use fake ModelProvider responses for normal tests and preserve existing research,
provider, tool and agent regressions. No live calls in tests/startup. Run pnpm lint,
pnpm format:check, pnpm test, pnpm typecheck, pnpm build and git diff --check for
completed tasks. Evaluation remains evidence of deterministic behavior unless
separate live-quality requirements are explicitly authorized.

## Non-goals

Unless a later task earns them through explicit requirements, exclude RAG,
embeddings, long-term semantic memory, Redis merely for future scaling, message
queues/workers, multi-agent systems, browser automation, MCP, Temporal, frontend,
Python AI service, distributed execution, live production deployment and autonomous
high-risk actions. Checkpoint/state persistence must not be confused with long-term
agent memory. No database, service or framework choice is implied by this SPEC.

## V0.4-001 authorized contracts

Implemented phase union: awaiting_decision, awaiting_tool_result, completed, failed.
Each carries AgentState; only awaiting_tool_result carries a canonical pendingCall,
only completed carries a validated result, and only failed carries a safe existing
agent failure code. Terminal phases reject transitions. Pure decision/observation/
failure transitions validate inputs; observations must match the pending canonical
call before append. Strict control envelopes reject contradictory fields.
[ADR-009](../../adr/ADR-009-orchestration-contracts.md) records the design and limits.
These contracts describe logical progress, not persistence or resume guarantees.
No runner, provider or tool behavior changed. V0.4-002 adds checkpoint semantics below.

## V0.4-002 authorized checkpoint semantics

Version 1 checkpoints carry orchestration state, iterationsConsumed, maxIterations
and deadlineEpochMs. Restoration validates all data for inspection. Automatic resume
eligibility requires quiescent awaiting_decision, remaining iterations, a strictly
unexpired original absolute deadline and fresh caller-supplied execution context.
No permissions or runtime objects belong in checkpoint metadata. ToolExecutor
retains permission authority. Pending-tool states never automatically repeat calls;
terminal restoration is inspection only. Consumed iterations and deadline never reset.
Wall-clock time while checkpointed counts; future intentional human pauses may need
separate time semantics. [ADR-010](../../adr/ADR-010-checkpoint-resume-semantics.md)
records limits and future orchestration obligations. Helpers validate and check
eligibility only; no storage, execution, durable recovery or replay protection is
implemented. V0.4-003 adds single-iteration advance below.

## V0.4-003 authorized single-iteration advance

Orchestrator.advance performs at most one decision and one controlled tool call,
returning a logical terminal or awaiting_decision checkpoint. It preserves budgets,
absolute deadline, safe failure precedence and fresh permissions. Pending-tool
restoration never executes. Malformed checkpoints reject safely; valid agent-level
failures become terminal failed state. AgentRunner remains unchanged. ADR-011 records
the official-documentation comparison and decision to retain custom orchestration
without LangGraph. No durable storage, replay/concurrency protection, interrupts or
ambiguous-effect recovery is implemented. V0.4-004 adds intentional pause below.

## V0.4-004 authorized intentional pause

Trusted application code may pause only at quiescent awaiting_decision boundaries
between advances. A separate serializable paused envelope preserves consumed/max
iterations and remaining active execution milliseconds, outside AgentState. Explicit
resume requires fresh context and rebuilds the deadline from that remainder; paused
wall time does not count. Ordinary checkpoint wall-clock semantics remain unchanged.
Paused data cannot advance directly. Terminal and pending-tool states cannot pause
or resume. Cancellation remains terminal. ADR-012 records the distinction and caller
obligations. No durable storage, replay/concurrency protection, identity/approval
system, expiration policy, notifications, UI or framework is added.

## V0.4-005 authorized diagnostics and recovery evidence

Every advance call emits one safe correlated completion event with duration,
outcome, validated resulting phase/count when available and safe failure category.
Payloads and runtime context are excluded; logging failure cannot change results.
Checkpoint/restore/pause/resume/transition helpers remain pure. Integration tests
cover serialized continuation, intentional pause, preserved budgets/deadlines,
fresh permissions, non-resumable states and late-work settlement. This demonstrates
logical recovery and suppression of late state effects, not underlying cancellation,
durable storage or replay/concurrency protection. ADR-011 records the boundary.
