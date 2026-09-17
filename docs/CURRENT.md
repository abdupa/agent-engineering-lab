# Current work

Project: Agent Engineering Lab

Release: v0.7 — Evaluation

Status: **In progress.** v0.7-001 is complete. v0.7-002 is next and unauthorized.

Current task: none active.

v0.6 is **Released** with one exit criterion unmet, stated in
[RELEASE.md](releases/v0.6/RELEASE.md).

## v0.7-001 — the run record becomes readable

The nine live runs v0.6 paid for were written to disk and never read back. They are now
parsed by a schema, and a record that will not parse reports **why** rather than reporting
zero. The distinction is the whole point: a corrupt file and a run that genuinely found
nothing are different facts, and an evaluation that writes both down as `0` is lying
quietly.

Four reasons are separated — unreadable file, empty file, unparseable JSON, and a shape the
schema refuses — and a failure names the field path and the issue code without ever
repeating a value from the record. Findings hold source code and a description of its
weaknesses, so a diagnostic that helpfully echoed the bad field would put both in a log.

**64 tests.** 48 against hand-written records, 16 against the real corpus.

### What reading the corpus revealed

**The format already changed once.** Four of nine records predate both the token budget and
the typed transport and carry neither field. A schema written from the newest record alone
would have rejected almost half the evidence, and the obvious conclusion — that the files
were broken — would have been wrong.

**The corpus holds four findings, not seven.** Three of the seven hand-checked in RUNS.md
are in no file: two came from a probe script that writes no record, and one was lost in
transit. The SPEC has been corrected, and the count is now asserted by a test.

**A record cannot say why a run failed.** Run 9 was a configuration fault that never
reached the network, and the file says `DECISION_FAILED` — the same word a run of confused
model output gets. The only clue left is `usage.calls: 0`. Pinned by a test, not fixed;
fixing it changes the record contract and needs its own task.

**One defect, found by the tests.** The loader read the system error code behind
`error instanceof Error`, which is false inside the test runner because Node builds
filesystem errors in a different realm. A missing file reported `unknown`. It would have
worked in a normal process, which is how that class of defect survives until it matters.

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

**v0.7-002 — the answer key and the first labeled target.** Not started. A fixture tree
with real-looking defects, clean files that contain none, and per-file content hashes so a
target that drifts from its key fails loudly instead of scoring line numbers that no longer
mean anything.

Seven milestones, six of them free: a run-record schema, an answer-key format and a labeled
target with clean control files, a documented matching rule, pure metric functions, a
scorecard script, and a regression gate. The seventh is one live run against the labeled
target — the first number that describes the agent as it is now rather than as it was
stored.

The inputs are thinner than they look. Eleven recorded runs, but only three produced
findings anyone checked: two planted in a fixture, two real, and three mediocre. Seven
findings is three anecdotes, not a dataset, so most of v0.7 is construction.

**v0.8 — Verification** follows it, because a checker that compares a claim against its
evidence would have caught two of run 11's three, and without a baseline there is no way
to show that it did.

**v0.9 — Second agent (contract review)** after those. It remains the test of the platform
claim: if it arrives by copying a folder and swapping the tools, the boundary was right.

A planned task is not authorization to start it.
