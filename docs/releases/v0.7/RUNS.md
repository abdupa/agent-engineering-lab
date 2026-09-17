# v0.7 live runs

Runs against `docs/eval/targets/small-service`, which has an answer key. Unlike every run in
[v0.6](../v0.6/RUNS.md), these produce a number rather than a paragraph.

---

## Run 12 — the first scored run, and the prompt changes finally answered

Date: 2026-09-17 · `gpt-5.6-luna` · typed arguments · 20 steps / **30,000 tokens**

**Outcome: `BUDGET_EXCEEDED` after 13 iterations and 12 tool calls. Five findings recorded
and kept.** 30,087 tokens, 39 seconds.

### The scorecard

| Measure                  | Run 12         | Run 11 (for reference) |
| ------------------------ | -------------- | ---------------------- |
| Recall                   | **2/7 (29%)**  | 2/3                    |
| Precision                | 2/4 (50%)      | 2/3                    |
| Citation accuracy        | 2/4 (50%)      | 2/3                    |
| Severity agreement       | **2/2 (100%)** | **0/2, inflating +2**  |
| False alarms on controls | **0/5**        | 0/3                    |
| Duplicate rate           | 1/5 (20%)      | 0/3                    |
| Cost per located defect  | ~15,000 tokens | ~34,000 tokens         |

Run 11 was scored against a label over real code and this against a synthetic target, so the
columns are not the same measurement. Severity and false alarms compare honestly; recall
does not.

### The budget held almost exactly

30,000 allowed, 30,087 spent — a **0.3% overshoot** against run 11's 13%. Same guard, smaller
steps: the overshoot is however much the call that crosses the line costs, and the calls here
were small.

The estimate before the run was 25,000–40,000 tokens with a ceiling of about 32,000. It
landed at the ceiling because the budget, not the task, ended the run.

### What the five findings were

```
[0] near_miss  SS-004  files.ts:26  off by 4   evidence: "async removeAll(names: readonly string[])..."
[1] matched    SS-004  files.ts:22             evidence: "    }"
[2] duplicate  SS-004  files.ts:21             evidence: "      return true;"
[3] matched    SS-002  db.ts:21                evidence: "SELECT ... WHERE email = '${email}' LIMIT 1"
[4] near_miss  SS-001  config.ts:17 off by 2   evidence: ""
```

### The citation instruction works, and the tool cannot express it

Findings 0, 1 and 2 are the same claim at lines 26, then 22, then 21. **Line 21 is the keyed
defect exactly** — the `return true;` inside the catch block.

The agent reported at 26, got back the signature of a different method, reported at 22, got
back a closing brace, reported at 21, and got back the line it meant. That is precisely what
the 2026-09-17 prompt change asked for: read what `report-finding` echoes and re-report with
a corrected line.

**It obeyed, and the report is worse for it.** `report-finding` can only append. There is no
way to replace a finding, so a correction arrives as another finding, and a reviewer opening
this report sees one defect described three times with two wrong citations attached.

The scoring makes it worse still: the rule gives the defect to the _first_ citation landing
inside the span, so finding 1 — a closing brace — is the match, and finding 2, the exact
line, is a duplicate. The agent's best work is scored as redundant.

**Two of the three prompt changes contradict each other.** "Re-report with a corrected line"
and "report the clearest instance rather than repeating it" cannot both be satisfied by an
append-only tool. That was invisible until a run did both.

Finding 4 is the same mechanism failing: it cited `config.ts:17`, a blank line, and the
echoed evidence was the empty string. It did not correct that one. So the instruction is
followed sometimes, not always.

### The severity instruction works

**2/2 exact, mean signed delta 0.** `high` for the SQL injection, keyed high. `medium` for
the write-that-reports-success, keyed medium.

Run 11 rated every finding `high` and was two ranks over on all of them. This is the
clearest evidence the release has produced that a prompt change did what it was meant to —
and it is still two matched findings in one run, which is a signal and not a result.

### Nothing was flagged in the control files

Zero findings in `format.ts` and `health.ts`. No invented paths, no invented evidence.

### What it missed, and why that number cannot be trusted yet

Five of seven: the hardcoded key (near missed), the path traversal, `Math.random` as a token
source, the lying doc comment, and the missing `await`.

**Recall of 2/7 is not evidence the agent cannot find these.** Three of its five findings
were spent re-citing one defect, and it was still reading when the budget stopped it. The
run ended on cost, not on completion. Whether it missed five defects because it cannot see
them or because it ran out of money is **unresolved**, and the next run at a higher budget
is what separates those.

### Three gaps in the run record, found by trying to analyse this run

Each one is something the analysis above needed and had to get from console output or by
hand:

1. **The record does not say what it audited.** No `auditRoot`. This is why scoring with
   `--target` cheerfully scores all nine v0.6 runs against `small-service` and reports
   0/7 for each. Their scorecards were deleted rather than committed.
2. **The record does not store the trajectory.** Which files were read, in what order, is in
   the console and nowhere else — so "did it ever read `session.ts`?" cannot be answered
   from the evidence, and that question decides whether recall is a coverage problem or a
   detection problem.
3. **The record still cannot say why a run failed**, carried over from v0.7-001.

All three are the same shape: the record was written to prove a run happened, and is now
being asked to explain one.

Record: `docs/releases/v0.7/runs/2026-09-17T15-47-42-591Z.json`
