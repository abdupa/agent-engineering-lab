# v0.7 — Evaluation: an instrument for the audit agent

Status: In progress. v0.7-001 to v0.7-005 complete; v0.7-006 not started.

## The product requirement that earns this release

A reviewer asked to act on an audit report needs to know how often its findings are right
before they spend time on one. Today the only answer this repository can give is that a
person read eleven run records by hand, and the honest summary of that reading is "two
good findings once, and three mediocre ones later."

The same gap bites from the other side. Three prompt changes shipped on 2026-09-17 in
response to [run 11](../v0.6/RUNS.md). Nothing here can say whether they helped, and
nothing would notice if the next change made the agent worse.

This release builds the instrument. It does not make the agent better.

## Goal

A deterministic, offline scorer; a labeled target with an answer key; a first recorded
baseline; and a gate in the test suite that fails when the numbers move the wrong way.

Advances no catalogue pattern. Evaluation is the instrument the pattern claims depend on —
whether verification helps, whether a second agent transfers, whether a routed pipeline
beats one agent with tools. Three gated patterns in [PATTERNS.md](../../PATTERNS.md) — #11
Chain-of-Agents, #15 Self-Improving, #29 Collective Intelligence — name evaluation as their
trigger, so until it exists none of them can fire on evidence rather than on appetite.

## Architecture direction

```text
docs/eval/targets/<name>/README.md  what the target is, and not to repair it
docs/eval/targets/<name>/key.json   the answer key: file, span, severity, why, hashes
docs/eval/targets/<name>/src/       the audited tree — the only part the agent sees
docs/eval/labels/<runId>.json    hand labels for runs against unlabeled code

apps/api/src/evaluation/
  run-record.schema.ts     parse and validate a recorded run  (fails closed)
  answer-key.schema.ts     parse and validate a key
  match.ts                 finding <-> keyed defect, one documented rule
  metrics.ts               pure functions over (record, key) -> Scorecard
scripts/score-run.ts       score a recorded run, print a scorecard, write it
test/evaluation/           scorer correctness + the baseline gate
```

Scoring is a pure offline function of a record and a key. It makes no network call, loads
no provider, and never runs the agent. `scripts/live-audit.ts` produces records; the
scorer only reads them.

## Preserved boundaries

- `POST /audit` is unchanged. No evaluation code appears on the request path.
- `AuditService`, `AgentRunner`, `ToolExecutor` and the audit tools are unchanged. An
  instrument that requires changing the thing it measures is measuring something else.
- `src/evaluation/` imports types from the audit and agent modules and nothing executable.
- **The run record becomes a contract.** It has a consumer now. Fields may be added;
  removing or renaming one breaks every stored record, so it is a breaking change and gets
  an ADR.
- Path handling inside the scorer goes through `Workspace`. A record is a file that may
  have arrived from anywhere, its `path` fields are strings someone else wrote, and
  resolving one against a target tree is the same confinement problem v0.6 already solved.

## Required distinctions

These get confused constantly, and run 11 contained three of them at once.

- **Citation accuracy != claim correctness.** A true claim on the wrong line and a false
  claim on the right line are different defects with different fixes. Run 11 produced
  both. Scoring them as one number hides which is happening.
- **Precision != recall.** An agent that reports one certain finding and an agent that
  reports twenty guesses can score identically on one of these and oppositely on the other.
  A single "accuracy" figure is the thing this release exists to stop producing.
- **A score on a labeled fixture != quality on unfamiliar code.** The fixture has an
  answer key because somebody planted the answers. That is a regression instrument, not a
  claim about production.
- **Regression gate != quality bar.** The gate says "not worse than the recorded
  baseline". It says nothing about whether the baseline was any good.
- **Replay != rerun.** Scoring a stored record re-reads a decision the model already made.
  It cannot discover what the model would do now, and it costs nothing.
- **Unkeyed != wrong.** A finding with no matching entry in the key is unclassified, not
  a false positive. Run 5 found two real defects nobody had planted; a scorer that called
  those false positives would have punished the single most valuable run so far.
- **Measurement != evaluation.** Tokens per finding is a measurement. Whether the findings
  were worth the tokens is a judgment, and this release does not automate it.

## Reliability policy

- **Failure modes.** A record that will not parse; a record valid but missing `findings`;
  a key that references a file absent from its target; a target whose files have changed
  since the record was made; a finding whose `path` escapes the target root; zero findings;
  zero keyed defects.
- **Unscoreable is a result, and it is not zero.** A record that cannot be parsed, or one
  whose target no longer matches its key, scores `unscoreable` with the reason attached.
  Reporting zero would be a claim about the agent that the data does not support. This is
  the claim-discipline rule from [CLAUDE.md](../../../CLAUDE.md) expressed in code.
- **Retryable vs terminal.** Nothing is retried. Every failure here is deterministic —
  the same record and key produce the same outcome forever, which is the property that
  makes a gate possible at all.
- **Deadline.** None. There is no network call and no unbounded loop; the work is linear
  in findings times keyed defects, both of which are small and both of which are bounded by
  the record's own step cap.
- **Side effects.** Writes a scorecard file under `docs/eval/`, and nothing else.
  Overwriting the scorecard for a given run id with the same inputs produces the same
  bytes, so repetition is safe.
- **Fail closed.** An unparseable record, an unreadable key, or a target/key mismatch
  fails the score. A scorer that guesses past bad input produces numbers that look like
  evidence.
- **Targets are pinned by content.** A key records a hash of each file it makes claims
  about. Scoring a record against a target whose files have moved is the most likely silent
  corruption in this design, because line numbers stay valid-looking while meaning
  something else — precisely the failure run 11 exhibited inside a single run.

## Observability

- **Emits on success:** run id, target name, key version, counts per outcome (matched,
  unkeyed, missed), each metric with its numerator and denominator, and the token and
  latency figures carried in the record.
- **Emits on failure:** the reason (`unparseable_record`, `key_target_mismatch`,
  `path_outside_target`, `missing_key`) with the run id and the offending field name.
- **Never emitted:** claim text, evidence text, and any line of source. Findings quote
  code, and an evaluation corpus is a list of where the defects are — a more sensitive
  artifact than the code it describes. Field names and counts go to the log; content stays
  in the scorecard file.
- **Correlation:** the run id already in the record is the identifier, carried into every
  line the scorer emits, so a scorecard joins back to the run that produced it.
- **Acceptance test:** given only the logs, an operator can say whether a scoring run
  failed on the record, the key, or the target — without seeing any of their contents.

## Security

The scorer trusts nothing in a record. Records are JSON files that may have been produced
on another machine, edited by hand, or copied from a shared corpus, and every field is
validated before use. Three specific concerns:

- **Path traversal through a finding.** `findings[].path` is a model-supplied string that
  survived into storage. Resolving it against a target tree goes through `Workspace`, which
  already rejects absolute paths, `..`, symlink escape, and excluded files.
- **A key is as trusted as a test fixture,** because that is what it is. It lives in the
  repository, changes through review, and is never generated from a model's output — a key
  written by the thing being measured measures nothing.
- **The corpus is disclosure-sensitive.** Targets in this repository are synthetic. The
  moment a real codebase is audited, its record contains that customer's source and a map
  of its weaknesses. Nothing in this release publishes a record, and the eventual answer is
  a retention and redaction policy, which is not a v0.7 decision.

What it could be tricked into doing: reporting a good score. A record with fabricated
findings that happen to match the key scores perfectly. The mitigation is that records are
produced by `live-audit.ts` and committed, so a fabricated one is visible in review — not
that the scorer can tell.

## Milestones

| Task     | Objective and required outcome                                                                                                                                                   | Evidence / exit criteria                                                                                                                                                                          |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| v0.7-001 | Run-record schema and loader. Every one of the nine stored records parses, or the schema is wrong and says which field.                                                          | All nine records in `docs/releases/v0.6/runs/` load. A truncated, an empty and a hand-corrupted record each fail with a distinct reason.                                                          |
| v0.7-002 | Answer-key format and the first labeled target: real-looking defects, **plus clean files that contain none**, with per-file content hashes.                                      | Key parses; hashes match; the control files are listed in the key as expected-empty.                                                                                                              |
| v0.7-003 | Matching rule. One documented rule deciding when a finding matches a keyed defect, and what "unkeyed" means.                                                                     | Tests for exact line, line inside a keyed span, adjacent-but-outside, right file wrong line, right line wrong file, and duplicate findings.                                                       |
| v0.7-004 | Metrics over (record, key): precision, recall, citation accuracy, severity agreement, duplicate-claim rate, tokens per finding, findings per 10k tokens. Pure functions, no I/O. | Hand-computed expected values on synthetic records. Denominators reported beside every rate, so 1/1 never prints as 100%.                                                                         |
| v0.7-005 | `scripts/score-run.ts` and a hand-label form for runs against unlabeled code, so the four findings stored in records become data instead of prose.                               | The script reports every stored record with a status; the two that produced findings carry labels and scorecards, and the other seven report as unlabeled rather than as runs that found nothing. |
| v0.7-006 | Baseline and regression gate in the suite.                                                                                                                                       | A committed baseline file; the gate fails when a scorecard drops below it; a test proves the gate fails, rather than asserting it passes.                                                         |
| v0.7-007 | **One live run against the labeled target.** The only paid step, and the first number that describes the current agent rather than a stored one.                                 | Recorded in `docs/releases/v0.7/RUNS.md` with its scorecard, and the prompt changes from 2026-09-17 finally have a measurement beside them.                                                       |

v0.7-007 is last deliberately. Everything before it is free, and a live run spent before
the scorer exists produces another anecdote.

### The key lives outside the tree it describes

The architecture sketch above originally put the key beside the fixture files. It is a
sibling of the audited tree instead, because an agent pointed at a target reads that tree,
and a key stored inside it is a file the agent can open. Every score taken afterwards would
be worthless and nothing would look wrong.

The same reasoning put `README.md` outside `src/` and kept both out of the keyed file list.

### The target is excluded from the repository's own tooling

Prettier would reformat the fixture, which changes bytes the key has hashed and turns the
target unscoreable. ESLint would report the planted defects as errors and fail the gate.
Both exclusions are recorded where they are made, since a future reader finding an
un-linted directory deserves the reason rather than a mystery.

### What v0.7-005 produced, and one thing it corrected

`pnpm score:runs` reads every stored record and reports a status for each. Two are scored
against labels; seven report as **unlabeled**, which is the honest word — they found nothing
and there is nothing to score them against, and that is not the same as scoring zero.

**Labels carry both a key and the reader's verdicts.** The key lets the existing matcher and
metrics run unchanged, so a labeled real run is scored exactly like a synthetic target. The
verdicts record what the person concluded in their own vocabulary. Keeping both allows the
comparison neither permits alone: **the rule measured against the person**. Across the four
labeled findings they agree on three. The one disagreement is run 11's third finding, it is
reported with the reader's own note attached, and it is never used to adjust the rule —
tuning a rule until it agrees with the run it was built from stops it predicting anything
about the next one.

**A label may not claim to be exhaustive.** A key over real code cannot honestly say it
lists every defect in it, and the schema refuses one that tries. Claiming otherwise would
turn every finding the reader did not recognise into a false positive, which is exactly the
mistake that would have scored run 5's two genuine discoveries as errors.

**One defect found while using the script.** Every scorecard was written to
`<runId>.json`, so scoring the same runs against a target silently overwrote the scorecards
produced from their labels. Two measurements of one run are two different results and the
most recent is not the true one. Scorecards are now filed under what they were scored
against.

**A latent defect the tests had not caught.** The key schema allowed only letters in a
defect id, which would have rejected `R11-001` — the label files could not have loaded. It
survived because the run-11 key used in tests was a TypeScript literal that never passed
through the schema. Widened, with the accepting cases now tested rather than only the
rejecting ones.

### The first numbers, and the two rules that govern all of them

**Every rate carries its denominator.** A rate is a fraction and the percentage is derived
from it. One correct finding out of one is 100% and is also a sample of one, and only the
denominator says so. A bare percentage is the cheapest way to make three anecdotes look like
evidence.

**A rate that cannot be computed is absent, not zero.** No findings means precision is
unmeasurable, not nil. A key that does not claim to be exhaustive cannot classify its
unmatched findings at all, so it reports no precision and says why. Substituting zero would
make a claim the data does not support — the same failure `unscoreable` prevents at load.

There is deliberately **no single score**. A release built to stop one number hiding the
truth does not finish by producing one number, and a test fails if a field named `score`,
`grade`, `overall`, `total` or `rating` ever appears on a scorecard.

What precision is allowed to judge, and what is excluded, with the reason for each:

| Outcome     | In precision?                 | Why                                                                                       |
| ----------- | ----------------------------- | ----------------------------------------------------------------------------------------- |
| `matched`   | yes, as right                 | Located a real defect and cited it inside the span                                        |
| `near_miss` | yes, as wrong                 | A claim on the wrong line is worse than none: a reviewer must recheck the file themselves |
| `unkeyed`   | only if the key is exhaustive | Otherwise genuinely unknown — run 5 found real defects nobody planted                     |
| `duplicate` | no                            | Repeating a correct finding is noise, not error; `duplicateRate` measures it separately   |
| `file_only` | no                            | A finding citing no line cannot be right or wrong about one                               |

Dropping things from a denominator is exactly how a metric becomes flattering, so each
exclusion is stated rather than assumed.

#### Run 11, scored

The first run in this repository to have numbers attached.

| Measure                  | Value                                          |
| ------------------------ | ---------------------------------------------- |
| Recall                   | 2/3 (67%)                                      |
| Precision                | 2/3 (67%)                                      |
| Citation accuracy        | 2/3 (67%)                                      |
| Severity agreement       | 0/2 (0%), mean signed delta **+2** — inflating |
| False alarms on controls | 0                                              |
| Cost per located defect  | **~34,000 tokens**                             |

These describe one run against a key written from one person's reading. They are a data
point, not a result. Their value is that the next run can be compared against them.

The token figure is the one nobody had seen before. 68,157 tokens over 13 provider calls
produced two located defects. Whether that is expensive is not a question this repository
can answer yet — nothing has established what an audit finding is worth — but the number now
exists to be argued about.

### The matching rule, stated once

> A finding matches a keyed defect when it names the same file and its cited span overlaps
> the keyed span by at least one line.

Everything else is a consequence of that sentence, or a decision about what to do with the
findings it does not cover.

**No tolerance beyond the keyed span.** The span is already the tolerance: a defect in a
three-line call expression is keyed across all three, because any of them is an honest
citation. Adding a window on top would count the same slack twice and let a vaguer citation
score like an accurate one.

**Five outcomes, because two would hide the thing worth seeing.** `matched`, `duplicate`,
`near_miss`, `file_only`, `unkeyed`. Run 11 cited `grep.tool.ts:67` for a defect on line 65
— the right file, the right defect, two lines off. Under a match/no-match report that is
indistinguishable from a finding that was simply wrong, and the two call for completely
different responses.

**The near-miss window cannot move a score.** A near miss is never a match, never claims
its defect, and never enters precision or recall. Because the threshold is diagnostic only,
choosing it badly costs a noisier report and cannot inflate a number — which is what makes
an arbitrary constant safe there and would make it dangerous anywhere in the scoring path.

**`unkeyed` does not mean wrong.** Whether an unmatched finding is a false positive depends
on the key's `exhaustive` flag, and applying that policy belongs to the metrics rather than
here.

**Order decides duplicates.** The first finding to reach a defect claims it. Judging which
of two findings is better written is precisely what this release refuses to automate.

**Paths compare exactly, never by suffix.** Suffix matching would make a run against the
wrong root half-work, and numbers that look plausible are worse than a visible failure.

#### Where the rule disagrees with the hand analysis

Applied to run 11's three findings against a key written from the RUNS.md verdicts, the rule
agrees on two and disagrees on one.

RUNS.md calls `report-finding.tool.ts:51-54` a wrong span, because the finding points at the
`citedLines` guard rather than at the resolve or the open. The rule calls it a match: the
claim is about the gap between the resolve on line 50 and the open on line 55, the keyed
span is that gap, and 51-54 sits inside it.

Both readings are defensible. The rule is not being bent to agree, because a rule tuned on
the run it was built from stops predicting anything about the next one. The consequence is
stated instead: **citation accuracy measured this way reads two in three on run 11, where
the hand count said one in three.** When those numbers are compared, this is why.

### What v0.7-002 produced

`small-service`: six TypeScript files, four carrying seven planted defects and two kept
clean as controls. Severity is spread four high, two medium, one low, deliberately — run 11
rated everything high, and a key that was also all-high could not have measured that. SS-007
is a missing `await` on a `last_login` timestamp and is keyed low; a finding that rates it
high is inflating, and now that is a number rather than an opinion.

One decoy is planted. `UNSET_KEY_NOTICE` in `config.ts` is named like a credential and is
only help text, sitting three lines above the real hardcoded key.

The key records a SHA-256 of every file. A stale key is the quietest failure available to
this design — line numbers stay valid-looking after an edit, so scoring would continue and
report confident numbers for a measurement that had stopped being real. Editing a file,
deleting one, adding an unkeyed one, or moving a line number each fail a test, proved by
making each change on a copy rather than by assertion.

### What v0.7-001 found in the stored records

Two things, both of which change what the later milestones may assume.

**The corpus holds four findings, not seven.** RUNS.md hand-checks seven, and three of
those are not in any file. Two came from run 2, which used the probe script and writes no
record. One is run 5's symlink finding, which was lost in transit and survives only as
prose. The starting dataset is therefore four findings across two runs out of nine, and
`test/evaluation/stored-records.spec.ts` asserts those numbers so the size of the input is
a test rather than a sentence.

**A record cannot say why a run failed.** RUNS.md records run 9 as a `CONFIGURATION`
failure that never reached the network. The stored record says `DECISION_FAILED`, because
the runner wraps the provider's code before the script writes it down. A configuration bug
that cost nothing and a model producing ten confused steps are the same word in the file,
and the only surviving clue is that `usage.calls` is zero.

That loss is pinned by a test rather than fixed here. Fixing it changes what
`live-audit.ts` writes, which is a change to the record contract and belongs in its own
task with its own reasoning about old records.

## Evaluation

What is measurable here is the scorer itself, which is an ordinary deterministic program
and is tested like one: known record plus known key produces known numbers.

A regression looks like one of three things, and they are not equally serious:

1. **A scorecard drops below the baseline.** The gate fails. Most likely cause is a prompt
   or model change; second most likely is noise, which is why a single run is not allowed
   to raise the baseline.
2. **A metric changes without any record changing.** The scorer moved. This is the worst
   case, because it silently rewrites history, and the test suite's hand-computed fixtures
   exist to catch exactly it.
3. **A record becomes unscoreable.** The target drifted from its key. Fails closed and
   names the file.

## Non-goals

- **No judge model.** Using an unmeasured model to measure an unmeasured agent produces a
  number nobody can defend, and doubles the surface that can quietly change underneath the
  baseline. Deterministic metrics against a human-written key first. A judge is revisited
  only when there is a baseline to validate it against — which is the point of doing this
  in the order stated in [ROADMAP.md](../../ROADMAP.md).
- **No live model calls in CI.** The gate scores stored records. A gate that spends money
  on every push is a gate that gets disabled.
- **No grading of unlabeled production code.** That needs judgment, and v0.7 gives the
  judgment a form to fill in rather than replacing it.
- **No dashboard, no trend charts, no multi-model comparison.** A scorecard is a file.
- **Not fixing the agent.** Any finding-quality improvement this release surfaces is
  recorded and left for v0.8 or later.

## What this will not prove

**A fixture score is not production quality.** The key exists because somebody planted the
answers. The agent may be better or worse on code nobody annotated, and this release
cannot tell you which.

**One run is a sample, not a score.** The agent is non-deterministic. Two runs against the
same target will differ, and a change of a few points between two single runs is
indistinguishable from noise. Claiming a prompt change helped needs repeated runs, which
cost money — so most prompt changes will stay unproven, and the honest record will say so
rather than quoting a one-run improvement.

**The gate protects the scorer and the stored corpus, not the live agent.** It fails when
the code that computes numbers changes, or when a stored record is replaced. A live
regression is caught only by spending a live run. This is the central limit of the design
and it is accepted knowingly: the alternative is a paid gate, which is a gate that runs
rarely and then not at all.

**Recall is recall against the key.** It measures planted defects found. It cannot measure
what the agent missed that nobody thought to plant, which is most of what a real reviewer
cares about.

**A small key has wide error bars.** With ten keyed defects, one finding is ten points of
recall. The numbers will look more precise than they are, and every rate is reported with
its denominator so the reader can see the sample is small.

**None of this makes the agent good at auditing.** It makes it possible to tell, which is
strictly less than it sounds and strictly more than what exists today.
