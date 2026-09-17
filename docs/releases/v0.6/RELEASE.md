# v0.6 — First agent

Status: **Released.** V0.6-004 was outstanding at closure and is now met — see
_The outstanding criterion, since met_ below.

The requirement that earned it: _an auditor needs findings on a codebase without reading
every file by hand._

## Delivered

A working agent reachable over HTTP, and the runtime hardening that getting it working
required.

| Milestone | Delivered                                                                            |
| --------- | ------------------------------------------------------------------------------------ |
| V0.6-001  | `Workspace` confinement and three read-only tools: `list-files`, `read-file`, `grep` |
| V0.6-002  | `Finding` contract, `report-finding` as a validated emission channel, `AuditService` |
| V0.6-003  | `POST /audit`, mounted in `AppModule` alongside research and health                  |
| V0.6-004  | Six live runs recorded with tokens, latency and failures — **see the gap below**     |

**The wiring debt from v0.2 is paid.** Until this release the tool system, agent loop,
orchestration and retrieval existed only as library code composed inside test files. A
request now enters over HTTP, reaches a real loop, drives real tools against a real
filesystem, and returns validated findings.

## What was fixed along the way

Seven of the nine defects the live runs exposed were in the **shared runtime**, and every
future agent inherits the fixes:

- `argumentsJson` cannot be escaped reliably by a model — typed transport added ([ADR-017](../../adr/ADR-017-typed-tool-arguments.md))
- `.optional()` without `.nullable()` is rejected outright by strict Structured Outputs
- `INVALID_OUTPUT` now records _why_: truncation, unparseable text, or a rejected shape
- Token and cost accounting, summed across SDK retries, surfaced in the audit response
- `AgentRunner` was stripping tool schemas before the decision layer could use them

And two in the audit tools, **both found by the agent auditing this repository**:

- `read-file` loaded whole files into memory before applying its byte budget
- a symlink to an excluded file bypassed the exclusion check — a hole in the confinement
  boundary the agent was running inside

## Evidence

627 tests in 34 suites. Format, lint, typecheck, build and diff clean. Six live runs
against `gpt-5.6-luna` recorded in [RUNS.md](RUNS.md), roughly 80,000 tokens, under one
cent by the provider's dashboard. Review in [REVIEW.md](REVIEW.md).

## The unmet criterion

**V0.6-004 required a completing run. None of the six completed.**

The agent produced two findings against unmarked real code. Both were verified by hand and
both were real defects, now fixed with regression tests. But every run ended in
`DECISION_FAILED` or `LOOP_LIMIT` before reaching `finish`.

The cause is understood and addressed — `argumentsJson` — and the fix is implemented but
**not yet confirmed against the live API**. Closing here rather than waiting is a
deliberate choice: the release's value is the agent existing and the runtime being
hardened, and both are done. The completing run is carried into v0.7 as its first task.

Anyone reading this should take it as: _the agent works, it finds real defects, and it has
never finished a run._ All three are true.

## What this release does not establish

No hit rate. Two findings is not a sample, and nothing measured what the agent missed. No
quality baseline, no precision or recall, no comparison against a human pass.

Confinement is tested against known attacks — the agent found one the suite had missed,
which is evidence the tests were incomplete rather than that they now are complete.

Budgets bound steps and wall time, not tokens. Nothing aborts a run for cost.

The typed transport satisfies every rule checkable offline and has not been accepted by a
live call.

## Not included

No memory, no planning, no async execution, no approval gates, no verification of whether
a claim follows from its evidence, no persistence, no deployment, no console. `run_tests`
stays deferred as an L3 decision pending the guardrails release. No second agent.

## Next

**v0.7 — Second agent (contract review).** Its first task is the completing run this
release owes, since the fix that unblocks it is already in. After that, the second agent's
real needs choose what comes next — async, guardrails, or document intelligence — rather
than the roadmap's order choosing for them.
