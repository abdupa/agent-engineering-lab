# v0.6 Review — first agent

Reviews the implemented agent and its evidence. Not release closure, not a quality
benchmark, not a claim that the agent is good at auditing.

## Execution model

```text
POST /audit { rubric? }
  -> AuditController        transport validation, safe error mapping
  -> AuditService           owns instructions, builds a per-run registry
  -> AgentRunner            iteration cap, deadline, cancellation
       -> AgentDecisionService -> ModelProvider
       -> ToolExecutor         -> list-files | read-file | grep | report-finding
  -> Finding[]              validated, evidence read from source
```

Registry, executor and collector are per-run. Two concurrent audits share no tool state
and cannot observe each other's findings; a test asserts it. `AUDIT_ROOT` is resolved once
at startup, so a missing root fails before the application listens.

## What the design got right

**Confinement as a boundary, not a check.** Every path from the model is treated as
hostile: absolute rejected, `..` rejected, symlinks resolved and re-checked, exclusion
list applied. It failed once (below) and the failure was inside the boundary rather than
around it — the fix was one line in one place.

**Findings emitted through the executor.** Asking the model to encode a report in its
finish text would have put unvalidated prose on the critical path. Every recorded finding
is an executor-validated result instead.

**Partial results survive.** A run that fails after recording findings returns them with
the failure stated. Three of six live runs ended badly; two still produced verified work.

**The request carries no path.** `AUDIT_ROOT` is configuration, so there is no transport
surface that could redirect an audit. Tested with `path`, `target` and `root` in the body.

## What the design got wrong, and how it was found

Six live runs found nine defects. Seven were in the shared runtime, not the agent.

| Defect                                                    | Found by      | Would tests have caught it?                                                   |
| --------------------------------------------------------- | ------------- | ----------------------------------------------------------------------------- |
| `toolCalls` inferred from `findings.length`               | run 1         | No — no scripted trajectory made tool calls and recorded nothing              |
| Cap of 2 made success structurally impossible             | run 1         | No — a budget question, not a correctness one                                 |
| `INVALID_OUTPUT` indistinguishable causes                 | run 3         | No — the code was correct, the diagnostics were not                           |
| Prompt read everything before reporting                   | run 3         | No — scripted trajectories never wander                                       |
| Context grows with the square of step count               | run 3         | No — fixtures are two files                                                   |
| `read-file` loaded whole files before applying the budget | **the agent** | No — the suite asserted what was returned, never what was read                |
| Symlink to an excluded file bypassed exclusion            | **the agent** | No — the suite tested a symlink leaving the root, never one landing on `.env` |
| `argumentsJson` cannot be escaped reliably by the model   | runs 5, 6     | No — fakes emit correct JSON by construction                                  |
| `AgentRunner` stripped tool schemas before `decide`       | wiring test   | Yes, once a test existed for the whole path                                   |

Two of those were found by the agent auditing this repository, one of them a hole in the
confinement boundary it was running inside.

The last one is the most instructive: the typed-argument flag was read correctly by config,
passed correctly to the decision service, and then silently discarded by a projection in
`AgentRunner` written in v0.3 to keep handlers away from the decision layer. Each link was
right; the chain was not. It was only caught by a test that asserted the whole path rather
than any link in it.

## Architecture findings

| Concern               | Finding                                                                                                                                                                                                                |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Premature abstraction | None added. No `AgentDefinition`, no agent registry, no plugin seam — deliberately, until a second agent makes the shared shape visible rather than guessed.                                                           |
| Duplication           | `audit.module.ts` and `research.module.ts` both build a `MODEL_PROVIDER` from config. Two is not yet a pattern; at three it should be extracted.                                                                       |
| Coupling              | `AgentToolDescription` now carries an optional Zod schema. That is shared data coupling, not a dependency on retrieval or provider internals. Handlers, permissions and the executor remain out of the decision layer. |
| Boundaries            | `ToolRegistry` still never executes; `ToolExecutor` still checks permission before parsing input; `AgentState` still holds only executor-validated observations. None moved to accommodate the agent.                  |
| Resource cost         | `read-file` and `grep` re-read from disk each call and re-walk the tree per search. No measurement justifies caching. Observation growth is the real cost and is recorded, not optimized.                              |
| Error boundary        | `INVALID_OUTPUT` now carries a reason and shape metrics; the rejected value is never logged, and the raw sample is behind an explicit opt-in.                                                                          |

## Evidence

627 tests in 34 suites, all passing. Format, lint, typecheck, build and diff clean. The
v0.6 contribution is roughly 130 tests across seven suites: confinement, the tools through
the executor, findings and evidence-by-reference, trajectories with fake providers, the
HTTP slice over a localhost socket, the typed transport, and the two defects the agent
found, written to fail first.

Six live runs against `gpt-5.6-luna`, recorded in [RUNS.md](RUNS.md) with their token
counts, latencies and failures. Roughly 80,000 tokens total, under one cent by the
provider's own dashboard.

## Limitations

**No run has completed.** Six attempts, none reached `finish` on real code. The agent has
produced exactly two findings against unmarked code, both verified by hand, both real. Two
findings is not a hit rate, and nothing has measured what it missed.

**Quality is unmeasured.** There is no precision figure, no recall figure, no baseline.
Whether the agent is useful on a codebase nobody has annotated is unknown.

**The typed transport is unverified live.** It satisfies every rule checkable offline —
converts, strict, no optional properties, no object permitting extras — and no live call
has confirmed the API accepts it.

**Confinement is tested against known attacks.** The agent found one the suite missed.
That is evidence the tests were incomplete, not evidence they now are complete.

**Budgets bound steps and wall time, not tokens.** Nothing aborts a run for being
expensive. Cheap at this scale; not a guarantee.

## Autonomous decisions

**L2 — evidence cited by location rather than quoted** (payloads shrank 79%, and a cited
line can no longer disagree with its text).
**L2 — typed tool arguments alongside the string transport**, recorded in
[ADR-017](../../adr/ADR-017-typed-tool-arguments.md), off by default.
**L3 stop — `run_tests` not built.** Spawning a process is a new trust boundary; it waits
for the guardrails release. The policy fired on the first milestone of the first release.
