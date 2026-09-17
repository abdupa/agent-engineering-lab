# Evaluation

Everything needed to say how well the audit agent did, and nothing that requires spending
money to produce.

```text
docs/eval/
  targets/     code with a known answer, written for evaluation
  labels/      real runs, read by a person afterwards and turned into data
  scorecards/  what came out, filed under what it was scored against
```

## targets/

A tree of source files plus `key.json`, which records where the planted defects are and a
hash of every file. The key sits outside the audited tree so the agent cannot read its own
answers. See [targets/small-service/README.md](targets/small-service/README.md).

A target answers: **did a change make the agent better or worse at a fixed task?**

## labels/

One file per run, named by run id. A label carries two different things: a key saying where
the defects actually were, and the reader's own verdict on each finding.

Keeping both allows the comparison neither permits alone — **the matching rule against the
person**. On run 11 they disagree once, and that disagreement is a number rather than a
paragraph somebody has to remember.

A label answers: **what did this particular run actually produce, according to someone who
read it?**

Labels exist because runs 5 and 11 audited real code that nobody had annotated. Their
findings were checked by hand and written up as prose in
[RUNS.md](../releases/v0.6/RUNS.md), and prose cannot be compared to the next run.

## scorecards/

Written by `pnpm score:runs`. Filed under what they were scored against, because two
measurements of one run are two different results and the most recent is not the true one.

- `by-label/` — the two labeled runs. Committed: they are the only real numbers here.
- `target-<name>/` — runs scored against a labeled target. Nothing yet; the first will
  arrive with the live run in v0.7-007.

## What exists today

Two runs, four findings, one disagreement between the rule and the reader.

| Run | Recall | Precision | Citations | Severity          | Cost per located defect |
| --- | ------ | --------- | --------- | ----------------- | ----------------------- |
| 5   | 1/1    | 1/1       | 1/1       | 1/1 exact         | ~14,000 tokens          |
| 11  | 2/3    | 2/3       | 2/3       | 0/2, inflating +2 | ~34,000 tokens          |

Every denominator is small and printed for that reason. Run 5 is not a 100% agent; it is one
finding that happened to be right.

## Running it

```bash
pnpm score:runs                                             # against labels
pnpm score:runs --target ../../docs/eval/targets/small-service
```

Both are free. Scoring re-reads decisions the model already made, so it can be run as often
as anyone likes — which is what makes a baseline affordable and why every milestone before
the live run costs nothing.
