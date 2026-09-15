# v0.4 Orchestration Review

V0.4-006 reviews the implemented logical orchestration foundation. No clear defect
or architecture violation requiring production correction was identified. This is
not a release declaration, live model quality benchmark or claim of learner mastery.

## Delivered execution model

```text
trusted application -> Orchestrator.advance(checkpoint, descriptions, fresh context)
  validate/copy checkpoint -> check phase, budget, deadline, cancellation
  -> one AgentDecisionService decision -> ModelProvider
  -> validate canonical decision -> pure phase transition
     finish -> completed checkpoint
     tool_call -> ToolExecutor -> ToolRegistry -> validated result/safe failure
       -> matching observation transition -> awaiting_decision checkpoint
  -> one safe completion record
```

Consumed iterations increase when a decision starts. One advance makes at most one
decision and one executor call. A tool call on the final allowed iteration can
return awaiting_decision with exhausted budget; the next advance fails LOOP_LIMIT
without a model request. Finish on that last decision succeeds. Safe tool failures
are observations; agent-level failures produce terminal failed state. Invalid
checkpoint data rejects safely because it supplies no valid domain state. Terminal
input returns for inspection without executing. Pending-tool restoration cannot
replay its call. AgentRunner remains the separate, unchanged v0.3 continuous loop.

## Boundaries and design findings

| Component          | Responsibility and review finding                                                                                                                                                 |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| orchestration.ts   | Phase union wraps AgentState; strict envelopes reject contradictory fields. Pure transitions require matching canonical observations and reject terminal transitions.             |
| checkpoint.ts      | Versioned logical state and budgets are validated on restoration. Resume eligibility is distinct from inspection and requires fresh context. No storage abstraction is invented.  |
| pause.ts           | Separate paused envelope stores remaining time outside AgentState. It cannot pass ordinary checkpoint validation or advance until explicitly resumed.                             |
| orchestrator.ts    | Owns one effectful iteration and deadline/cancellation settlement. ModelProvider and ToolExecutor remain authoritative boundaries; no raw handlers or SDK imports are introduced. |
| Completion wrapper | Logs safe metadata after settlement, including rejected input and terminal inspection. Pure helpers retain no logging effects.                                                    |

Repeated parsing is intentional at different boundaries: domain decision validity,
selected-tool input/output validity, JSON observation compatibility and restoration
validity are different claims. It also creates owned snapshots. Deep call matching
ignores object-key order, but is not invocation identity. JSON validation cannot
prove a result originated from ToolExecutor or that caller-supplied history is true.

The v0.3 runner and v0.4 advance path share policy patterns. Keeping both preserves
the expressly required compatibility and teaches different execution interfaces;
a generic execution engine would add abstraction without a new requirement. This
leaves a maintenance obligation to compare shared policy when later changes occur.
No dead abstraction requiring removal was identified. The components remain direct
application/test composition, with no agent HTTP endpoint or startup orchestration.

## Time, permission and interruption semantics

Ordinary checkpoints preserve consumed/max iterations and the original absolute
deadline: wall-clock time between advances counts. Intentional pause preserves only
remaining active time. If 37 seconds remain, an hour paused still leaves 37 seconds
on explicit resume. Neither operation replenishes iterations. Failed/cancelled and
completed states cannot pause/resume; pending tools cannot pause. The application
must establish quiescence between calls and discard old active snapshots.

Fresh grants are supplied separately for resume and advance; they are not stored.
ToolExecutor checks actual required permissions. Context shape validation is not
caller authentication, proof of freshness or an authorization service.

Cancellation/deadline settlement stops waiting and later orchestration stages, not
necessarily provider/tool work. Tests allow late work to complete and verify that
settled snapshots do not change and no contradictory second completion appears.
No rollback or exactly-once effect is promised. Wall-clock rollback, synchronous
blocking and trusted caller timestamps remain limitations. Logs are best-effort
local diagnostics, not durable audit storage; request correlation is not unique
run identity. Standalone pause/restore events await an owning application boundary.

## LangGraph decision

[ADR-011](../../adr/ADR-011-single-iteration-orchestration.md) compares the implemented
advance path with official LangGraph documentation. Custom orchestration was retained:
the current branch/transition structure is small and a framework would not remove
budget, validation or permission obligations. No dependency or prototype was added;
this is a design evaluation, not performance evidence. Larger graph, interrupt or
checkpoint integration requirements may justify reconsideration, but no adoption
is implied by the roadmap.

## Verification and evidence limits

370 deterministic tests in 20 suites passed. Formatting, format:check, lint,
typecheck, build and git diff --check passed. HTTP regressions used localhost
socket access. No live model request was made.

The v0.4 contribution is 96 tests: 30 state/transition cases, 27 checkpoint cases,
10 advance cases, 22 pause cases and seven recovery/diagnostic cases. Coverage
includes legal/invalid phases, matching observations, preserved budgets, expiration,
paused-time accounting, fresh permissions, fake-provider/real-service composition,
terminal non-execution, logger failure and late decision/tool completion.

JSON serialization/restoration demonstrates logical continuation. It does not test
process-crash recovery or a durable store: none exists. Valid-shaped tampering of
budgets/history is not detected as forgery. Scripted providers establish deterministic
system behavior, not live reasoning accuracy, reliability statistics or general goal
completion. Mastery exercises are in [MASTERY.md](MASTERY.md).

## Deliberately deferred and known concerns

No durable checkpoint/pause storage, concurrent-resume locking, replay protection,
idempotency receipts or ambiguous-effect recovery exists. Reusing an old snapshot
can repeat work; registration, clocks, state and schema callbacks remain trusted.
There is no identity/approval workflow, pause expiration, notification, UI, RAG,
long-term memory, queues, distributed execution or multi-agent capability. Domain
payloads are not secret-redacted or size-bounded by checkpoint envelopes.

The central lesson is to define continuation semantics before storage or frameworks:
state restoration, permission, time accounting and effect safety are distinct
boundaries. No next task is defined; further work requires explicit requirements.
