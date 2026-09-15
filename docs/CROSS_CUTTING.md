# Cross-cutting concerns

Reliability, observability, security and evaluation are **not patterns and not releases.**
They are obligations every pattern carries, and they are the first thing to quietly
disappear from a plan organised around capabilities.

They disappeared from the first draft of this repository's roadmap. This document exists
so that does not happen again.

## The rule

> Every pattern states its reliability policy and what it emits, before it is called done.
> A pattern with no failure policy is not finished. A pattern you cannot observe is not
> operable.

This is checked by `/pattern` when building and `/release` when closing.

## Why a release will not do

The temptation is an "observability release" somewhere around v1.6. That is wrong for the
same reason it was wrong in the predecessor repository, where instead **every layer got
its own instrumentation milestone** — v0.1-008 provider, v0.2-004 tool, v0.3-004 agent,
v0.4-005 orchestration.

Observability added afterwards describes a system you have already stopped understanding.
Reliability added afterwards is a rewrite.

## Required distinctions

These are separate things and get confused constantly.

| | |
| --- | --- |
| **logging** | records were emitted |
| **observability** | an operator can determine, from outside, what happened and why it failed |
| **explainability** | a reviewer can understand why the agent *decided* what it decided |
| **auditability** | a third party can verify after the fact that policy was followed |

Different audiences, different artifacts. Pattern #24 Explainable is on the roadmap
(v1.5); it does **not** discharge the observability obligation for any other pattern.

And for failure handling, extending the v0.4 chain
(`checkpoint ≠ restore ≠ resume ≠ retry`):

| | |
| --- | --- |
| **retry** | repeat an operation |
| **resume** | continue from a preserved position |
| **replay** | re-execute previously executed work |
| **idempotency** | repetition produces no additional effect |

Retry is safe for pure generation and dangerous for real side effects. That gap is where
most agent incidents live.

## What every SPEC must answer

**Reliability**

1. What are the failure modes — invalid input, timeout, cancellation, empty result,
   partial result, dependency unavailable?
2. Which failures are retryable, and under what budget? Which are terminal?
3. What is the deadline, and what does exceeding it guarantee? (It does not guarantee the
   work stopped.)
4. Does this pattern have real side effects? If so, what makes repetition safe?
5. On dependency failure, does it fail open or fail closed? Say which, and why.

**Observability**

6. What does it emit on success, on failure, and at boundaries?
7. What must never be emitted — payloads, prompts, credentials, memory contents,
   permission grants, raw provider errors?
8. How does a correlation identifier flow through it?
9. Given only the logs, can an operator say which boundary failed? If not, it is not done.

**Security**

10. What does this pattern trust, and what does it validate?
11. What authority does it hold, and what could it be tricked into doing?

**Evaluation**

12. What is measurable here, and what would a regression look like?

## Already established

Carried forward and still binding:

- [ADR-003](adr/ADR-003-provider-reliability.md) — provider reliability: bounded attempts,
  per-attempt timeout, adapter deadline, no nested retry
- [ADR-004](adr/ADR-004-structured-observability.md) — correlation and safe structured logs
- [ADR-006](adr/ADR-006-tool-reliability-and-policy.md) — tool deadlines, cooperative
  cancellation, permission-before-parse
- Concepts: [provider reliability](concepts/provider-reliability.md) ·
  [structured observability](concepts/structured-observability.md) ·
  [tool observability](concepts/tool-observability.md) ·
  [agent run observability](concepts/agent-run-observability.md) ·
  [orchestration observability](concepts/orchestration-observability.md)

Established limits that still hold: a timeout stops the caller waiting, not the work.
Cooperative cancellation cannot preempt a handler that ignores its signal. Console logs
are best-effort diagnostics, not durable audit storage. Correlation is not distributed
tracing.

## What each scheduled pattern newly introduces

Not boilerplate. Each of these is a genuinely new surface.

| Release | New reliability surface | New observability surface |
| --- | --- | --- |
| v0.6 Memory | Stale records; a read that returns nothing | Selection hit/miss, category, record count — **never content**. Memory may hold user data. |
| v0.7 Planning | A planner that replans forever | Replan count, plan depth, abandoned branches |
| v0.8 Async | **The largest jump.** At-least-once vs at-most-once, retry across a process boundary, poison jobs, step timeout vs job timeout, dead letter | Queue depth, job age, attempt number, terminal disposition |
| v0.9 Guardrails & HITL | An approval nobody ever answers; escalation timeout | Approval latency, denied actions, pending age |
| v1.0 Evaluation | Judge unavailable mid-run | **Cost and latency per run become first-class.** Partly an observability release by nature. |
| v1.1 Verification | Verifier unavailable — **fail open or fail closed is a safety decision, not a default** | Verification outcomes, disagreement rate against the generator |
| v1.2 Document intelligence | Malformed input, partial extraction, OCR that silently degrades | Extraction confidence, pages failed, fields missing |
| v1.3 Code execution | **Highest-risk surface in the plan.** Resource limits, OOM, runaway process, non-terminating code, sandbox escape | Execution duration, memory ceiling hit, exit status, output truncation |
| v1.4 Compliance | Policy engine unavailable; an unevaluable policy | Policy decisions with the rule that fired — this is auditability, not logging |
| v1.5 Explainability | — | The pattern itself, for reviewers rather than operators |
| v1.6 Console | — | Where all of the above finally becomes visible to a human |
| v1.7 TDD codegen | Infinite correction loops; tests that pass for the wrong reason | Iterations to green, tests added vs modified |

## The honest limit

None of this proves the system is reliable. It establishes that failure modes were named
before they were met, and that when one is met you can find it. Real reliability evidence
comes from production incidents, not from a checklist — which is one more reason the
product matters.
