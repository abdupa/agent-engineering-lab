# v0.7 Review — evaluation

Reviews the instrument this release built and the one run it measured. Not release closure,
and emphatically not a claim that the audit agent is good.

## Execution model

Nothing here is on the request path. `POST /audit` is untouched.

```text
scripts/live-audit.ts ──writes──► docs/releases/<release>/runs/*.json
                                            │
docs/eval/targets/<name>/key.json ──┐       │
docs/eval/labels/<runId>.json ──────┤       │
                                    ▼       ▼
                              matchFindings  ──► scoreRun ──► Scorecard
                                    │                            │
                                    └──► compareToLabels         ├──► docs/eval/scorecards/
                                         (rule vs person)        └──► compareToBaseline
                                                                      (the gate)
```

Scoring is a pure function of a record and a key. No network, no provider, no clock. It can
be run as often as anyone likes, which is what makes a baseline affordable and why six of
seven milestones cost nothing.

## What the design got right

**Unscoreable is a result and is never zero.** A record that will not parse, a key that no
longer matches its target, a run with no label — each reports what it is. Writing any of them
down as `0` would make a corrupt file and a run that genuinely found nothing indistinguishable,
which is how an evaluation harness starts producing numbers nobody can defend.

**Every rate carries its denominator.** Run 5 scores 100% on everything and is one finding
that happened to be right. Only the fraction says so.

**The key lives outside the tree it describes.** An agent pointed at a target reads `src/`;
a key stored inside would be a file it could open, and every score afterwards would be
worthless while nothing looked wrong.

**The target is hashed.** A stale key is the quietest failure available here — line numbers
stay valid-looking after an edit, so scoring would continue and report confident numbers for
a measurement that had stopped being real.

**The rule is measured against the person.** Every other number describes the agent; this one
asks whether the thing producing them agrees with the judgement it stands in for. It is
reported and never used to tune the rule.

**No single score.** A test fails if a field named `score`, `grade`, `overall`, `total` or
`rating` appears on a scorecard.

## What the design got wrong, and how it was found

| Defect                                                               | Found by                   | Would tests have caught it?                                                |
| -------------------------------------------------------------------- | -------------------------- | -------------------------------------------------------------------------- |
| Roadmap table disagreed with its own reorder note                    | reading two docs           | No — now it would; `release-numbering.spec.ts` exists because of it        |
| `instanceof Error` false across realms, so ENOENT read as `unknown`  | **a test**                 | Yes, and only because the assertion named the code rather than "an error"  |
| Defect ids rejected digits, so the label files could not have loaded | writing the label files    | No — the key under test was a literal that never passed through the schema |
| Every scorecard written to one filename, overwriting the last        | running the script twice   | No — nothing scored the same run two ways until it did                     |
| Planted credential matched a real vendor's format                    | **GitHub push protection** | No — the fixture was too realistic, which is a strange way to be wrong     |
| `report-finding` cannot replace a finding                            | **run 12**                 | No — it needed a model that actually obeyed the citation instruction       |

The last one is the release's best result and the only one that cost money.

## Architecture findings

| Concern               | Finding                                                                                                                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Premature abstraction | None. No evaluation framework, no pluggable metric registry, no judge interface. Seven files, each doing one thing.                                                                        |
| Duplication           | `StoredFindingSchema` deliberately duplicates `FindingSchema`. A stored record must keep its shape forever; importing the live one would let a refactor invalidate evidence retroactively. |
| Coupling              | `src/evaluation/` imports `SEVERITIES` and type-only declarations from `audit/` and `agent/`. Nothing executable crosses. The audit module imports nothing from evaluation.                |
| Responsibilities      | Schema files are pure; loaders own I/O; metrics own arithmetic; the script owns argument parsing and output. The split held without being enforced.                                        |
| Dead code             | None found. `formatRate` and `describeDifferences` exist only for human output and are used by the script and the gate's failure message respectively.                                     |
| Resource cost         | Scoring nine records takes under a second. Nothing justifies caching.                                                                                                                      |
| Error boundary        | Four load failures for records, three for keys, three for labels, five target problems. Every one names a field path or file and never a value from the data.                              |

## Evidence

**939 tests in 48 suites**, all passing. Format, lint, typecheck, build and diff clean. The
v0.7 contribution is **257 tests across 10 suites**: the record schema, the answer key, the
matching rule, the metrics, the labels, the stored corpus, the labeled target, the labeled
runs, run 11 through the rule, and the baseline gate.

One live run, [run 12](RUNS.md), 30,087 tokens.

Two defects were proved by mutation rather than assertion — the release-numbering drift, and
the baseline gate — by making the breaking change, watching the test fail, and reverting.

## Limitations

**The gate does not protect the live agent.** A prompt or model change moves no stored record,
so the suite stays green through it. This is the central limit of the design and it was chosen
knowingly: the alternative spends money on every push and gets switched off.

**One live run is not a measurement.** Run 12's numbers describe one run against one target.
Two runs would differ. Nothing here can distinguish a real improvement from noise, and saying
otherwise would need repeated runs nobody has paid for.

**Recall of 2/7 is confounded with the budget.** The run ended on cost while still reading.
Whether it missed five defects or ran out of money is unresolved.

**The target is synthetic and its defects are the quotable kind** — injection, traversal, a
weak random source, a hardcoded credential, a comment that lies. Real defects are rarely so
tidy. This measures whether a change helped on a fixed task; it does not measure competence.

**A seven-defect key has wide error bars.** One finding is fourteen points of recall.

**The matching rule disagrees with the reader once in four.** Both readings were defensible
and the rule was not bent to agree.

## Autonomous decisions

**L1 — exact pinning rather than a floor** in the baseline, because a floor lets the scorer
become more generous undetected. Demonstrated: narrowing the near-miss window raised citation
accuracy from 2/3 to 2/2 with no change to the agent.

**L2 — no judge model.** Measuring an unmeasured agent with an unmeasured model produces a
number nobody can defend and doubles the surface that can shift under the baseline. Revisit
only when there is a baseline to validate a judge against.

**L2 — `exhaustive` required with no default on every key.** The answer decides whether an
unmatched finding is a false positive or unclassified, and a default would pick a scoring
policy without anyone choosing it.

**L1 — near-miss window is diagnostic only** and cannot enter precision or recall, which is
what makes an arbitrary constant safe there.

No L3 decision arose. Nothing in this release touches auth, storage, external services or a
new trust boundary.
