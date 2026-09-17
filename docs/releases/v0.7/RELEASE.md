# v0.7 — Evaluation

Released 2026-09-18. Run 12 and every milestone before it dated 2026-09-17. Seven milestones, six of them free. The paid one cost about half a cent.

## The requirement this release was meant to earn

> A reviewer asked to act on an audit report needs to know how often its findings are right
> before they spend time on one.

**Met, narrowly.** The answer now exists as a number instead of a paragraph. It is one number
from one run against one synthetic target, which is enough to compare the next run against and
not enough to tell anybody how good the agent is.

## Delivered

| Milestone | What it produced                                                                         |
| --------- | ---------------------------------------------------------------------------------------- |
| v0.7-001  | Run records parse, and a record that will not parse says which of four things went wrong |
| v0.7-002  | `small-service`: six files, seven planted defects, two controls, every file hashed       |
| v0.7-003  | One matching rule: same file, spans overlap by at least one line                         |
| v0.7-004  | Metrics, every rate carrying its denominator, with no single score anywhere              |
| v0.7-005  | `pnpm score:runs`, and labels that turn a person's reading into data                     |
| v0.7-006  | A committed baseline the suite enforces, proved by watching it fail                      |
| v0.7-007  | Run 12 — the first scored run                                                            |

## Evidence

**939 tests in 48 suites**, all passing. Format, lint, typecheck, build and diff clean, each
read separately. The v0.7 contribution is **257 tests across 10 suites**.

One live run, [run 12](RUNS.md): 30,087 tokens against a 30,000 budget, a 0.3% overshoot.

| Measure                  | Run 12         | Run 11 (labeled real code) |
| ------------------------ | -------------- | -------------------------- |
| Recall                   | 2/7            | 2/3                        |
| Precision                | 2/4            | 2/3                        |
| Citation accuracy        | 2/4            | 2/3                        |
| Severity agreement       | **2/2**        | **0/2, two ranks over**    |
| False alarms on controls | 0/5            | 0/3                        |
| Cost per located defect  | ~15,000 tokens | ~34,000 tokens             |

The two columns are different measurements — one against a synthetic target, one against a
label over real code — so severity and false alarms compare honestly and recall does not.

## What the release answered

**The severity prompt change worked.** 2/2 exact, no drift. Run 11 rated everything high and
was two ranks over on all of it.

**The citation prompt change worked, and `report-finding` cannot express it.** The agent
reported one defect at line 26, then 22, then 21, landing exactly on the keyed line — reading
the echoed evidence and correcting itself, as instructed. The tool can only append, so the
correction arrives as a third finding, and a reviewer sees one defect three times with two
wrong citations attached.

**Two of the three prompt changes contradict each other.** "Re-report with a corrected line"
and "report the clearest instance rather than repeating it" cannot both be obeyed by an
append-only tool. Nothing revealed that until a run did both, and that is the clearest
argument this release can make for its own existence.

## Limits

**The gate does not protect the live agent.** A prompt or model change moves no stored record,
so the suite stays green through it. Chosen knowingly: a gate that spends money on every push
is a gate somebody turns off.

**One run is not a measurement.** Two runs would differ. Nothing here distinguishes a real
improvement from noise without repeated runs nobody has paid for.

**Recall of 2/7 is confounded with the budget.** The run ended on cost while still reading.
Whether it missed five defects or ran out of money is unresolved.

**The target is synthetic and its defects are the quotable kind.** Real defects are rarely so
tidy. This measures whether a change helped on a fixed task, not competence.

**A seven-defect key has wide error bars.** One finding is fourteen points of recall.

**The matching rule disagrees with the reader once in four labeled findings.** Both readings
were defensible; the rule was not bent to agree.

**Nothing here made the agent better.** It made it possible to tell — which is less than it
sounds and more than existed before.

## Deferred, with reasons

1. **`report-finding` cannot replace a finding.** The sharpest finding of the release, and a
   tool defect rather than a prompt one. Fixing it changes the tool contract and belongs in
   its own task. Until then the two prompt instructions stay in conflict, and the citation
   instruction is the one producing the better line.
2. **The run record cannot say what it audited, what it read, or why it failed.** Three gaps
   of one shape: the record was built to prove a run happened and is now asked to explain one.
   The first is why `--target` scoring cheerfully scores unrelated runs.
3. **One higher-budget run** would separate "cannot find" from "ran out of money". It costs
   money, so it is a decision rather than a task.
4. **A second target** would show whether any of this generalises. One target measures one
   task.

## Gated patterns reviewed

Required at every release boundary: record the trigger firing, or record that it has not.

| Pattern                     | Trigger                                                       | Status                                                                                                                                                                                                                                                        |
| --------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #11 Chain-of-Agents         | Evaluation shows a routed pipeline beats one agent with tools | **Still not triggered.** Evaluation now exists; nothing has compared a pipeline to anything.                                                                                                                                                                  |
| #29 Collective Intelligence | Same instrument, same bar                                     | **Still not triggered**, same reason.                                                                                                                                                                                                                         |
| #15 Self-Improving          | A working evaluation harness with regression detection        | **Still not triggered, and this is the close call.** The harness exists and the gate detects regressions in the _scorer_. An agent changing its own policy needs its live behaviour measured, and that costs a paid run each time. Necessary, not sufficient. |
| #16 Conversational          | The product acquires a conversational surface                 | Still not triggered.                                                                                                                                                                                                                                          |
| #19 Vision-Language         | The product must read screenshots, diagrams or scanned layout | Still not triggered.                                                                                                                                                                                                                                          |
| #20 Audio Processing        | A named requirement for speech input                          | Still not triggered.                                                                                                                                                                                                                                          |

## Claims audit

Run before closing. Five problems found and fixed:

| Where        | Claim                                              | What was true                                                        |
| ------------ | -------------------------------------------------- | -------------------------------------------------------------------- |
| `README.md`  | "468 tests across 25 suites. 16 ADRs."             | 939 / 48 / 17. The old figure was the carried-forward inheritance.   |
| `README.md`  | `audit:live` writes to `docs/releases/v0.6/runs/`  | Configurable since v0.7-007; `score:runs` was undocumented entirely. |
| `SPEC.md`    | v0.7-006 gate "fails when a scorecard drops below" | It fails on any difference. A floor was considered and rejected.     |
| `SPEC.md`    | v0.7-004 would produce "findings per 10k tokens"   | Built as cost per _located defect_; more findings is not better.     |
| `CURRENT.md` | v0.7-002 added "57 new tests"                      | 59. The gate printed 746 then 805.                                   |

No unsupported behavioural claims remained after these.
