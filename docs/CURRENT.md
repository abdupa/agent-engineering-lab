# Current work

Project: Agent Engineering Lab

Release: v0.7 — Evaluation

Status: **In progress.** v0.7-001 to v0.7-003 are complete. v0.7-004 is next and unauthorized.

Current task: none active.

v0.6 is **Released** with one exit criterion unmet, stated in
[RELEASE.md](releases/v0.6/RELEASE.md).

## v0.7-003 — the rule every score rests on

> A finding matches a keyed defect when it names the same file and its cited span overlaps
> the keyed span by at least one line.

No tolerance beyond the span, because the span is already the tolerance. Five outcomes
rather than two, because run 11 cited a line two away from a real defect and a match-or-not
report would show that as identical to being simply wrong. The near-miss window is
diagnostic and can never move precision or recall, which is what makes an arbitrary
threshold safe there. Order decides duplicates, since judging which of two findings is
better written is exactly what this release refuses to automate.

### It was checked against a real run, not only invented examples

Applied to run 11's three findings against a key written from the hand verdicts in RUNS.md,
the rule agrees on two and **disagrees on one**, and the disagreement is recorded rather
than tuned away.

RUNS.md calls one finding a wrong span; the rule calls it a match, because the claim is
about the gap between a resolve and an open and the citation sits inside that gap. Both
readings are defensible. Bending the rule to fit the run it was built from would stop it
predicting anything about the next one.

So **citation accuracy measured this way reads two in three on run 11, where the hand count
said one in three.** That is written down now, before any metric is built on top of it.

The rule did reproduce the severity finding exactly: every match reports `over` by two
ranks, which is the inflation the hand analysis described as "wrong by about two notches".

**56 new tests**, 861 in total.

## v0.7-002 — a target with a known answer

`docs/eval/targets/small-service/` is six TypeScript files written for evaluation. Four
carry seven planted defects; two are controls containing none, so a false positive is
measurable at all. Severity is spread on purpose — four high, two medium, one low — because
run 11 rated everything high and a key that did the same could not have caught it.

**The key sits outside the audited tree.** An agent pointed at this target reads `src/`, and
a key stored inside it would be a file the agent could open. That would make every score
taken afterwards worthless while nothing looked wrong.

**The key hashes every file.** A stale key is the quietest failure this design has: line
numbers stay valid-looking after an edit, so scoring would carry on producing confident
numbers for a measurement that had stopped being real. Editing a file, deleting one, adding
an unkeyed one and moving a line number each fail a test — each proved by making the change
on a copy, not by assuming.

**The target is excluded from Prettier and ESLint.** A formatter would change bytes the key
has fingerprinted; a linter would report the planted answers as errors and fail the gate.

**57 new tests**, 805 in total.

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

**v0.7-004 — the metrics.** Not started. Pure functions turning a match result into
precision, recall, citation accuracy, severity agreement, duplicate rate and tokens per
finding, with hand-computed expected values and every rate reported beside its denominator
so that one correct finding out of one never prints as 100%.

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
