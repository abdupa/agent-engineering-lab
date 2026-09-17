# Current work

Project: Agent Engineering Lab

Release: v0.6 — First agent

Status: **Released** with one exit criterion unmet, stated in
[RELEASE.md](releases/v0.6/RELEASE.md)

Current task: none active. v0.7 is planned and not started.

## What v0.6 delivered

A working agent reachable at `POST /audit`, and the runtime hardening that getting it
working required. The wiring debt carried since v0.2 is paid: the tool system, agent loop
and orchestration are no longer library code composed only inside tests.

Six live runs found nine defects. Seven were in the shared runtime and every future agent
inherits the fixes. Two were in the audit tools and were **found by the agent auditing
this repository** — one of them a hole in the confinement boundary it was running inside.

## The gap, stated plainly

**No run has completed.** The agent produced two verified findings against unmarked real
code, and every run ended in `DECISION_FAILED` or `LOOP_LIMIT` before reaching `finish`.
The cause is understood (`argumentsJson` escaping) and the fix is implemented but not yet
confirmed against the live API.

Read it as: the agent works, it finds real defects, and it has never finished a run.

## Verification

**627 passed, 34 suites.** Format, lint, typecheck, build and diff clean. Six live runs
recorded in [RUNS.md](releases/v0.6/RUNS.md), roughly 80,000 tokens, under one cent.

## Since release

**Token budget added** (`AUDIT_MAX_TOKENS`). Budgets bounded steps and wall time but never
cost, which was an inconsistency in something already treated as a safety boundary. A live
run burned 41,677 input tokens and produced nothing, and growth is roughly quadratic in
step count — a larger step cap on a bigger codebase is a real runaway, not a hypothetical
one. Earned by measured evidence rather than scheduled.

Building it surfaced a defect in the accounting itself: `AsyncLocalStorage.run` replaces
the store, so a run opening its own scope would have hidden every call from the
request-level accounting above it and the endpoint would have reported zero usage. Scopes
now carry a parent and `recordUsage` credits the whole chain.

## Next planned work

**v0.7 — Second agent (contract review).** Not started. Its first task is the completing
run v0.6 owes, since the fix is already in.

Agent #2 is also the test of the platform claim: if it arrives by copying a folder and
swapping the tools, the boundary was right. If it means editing shared code, it was not.

A planned task is not authorization to start it.
