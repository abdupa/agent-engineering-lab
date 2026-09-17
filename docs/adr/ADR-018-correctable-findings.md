# ADR-018 — An accumulating tool needs a correction path

Status: Accepted 2026-09-18. Unverified live; the run that motivated it predates the fix.

## Context

`report-finding` accumulates. Each call adds one finding to the report and there was no way
to change one afterwards.

That was fine while the agent reported once and moved on. On 2026-09-17 the audit goal
gained an instruction, written in response to [run 11](../releases/v0.6/RUNS.md), where two
of three citations pointed at the wrong lines:

> Check every citation. `report-finding` returns the exact lines your line number landed on.
> Read them. If they are not the lines your claim is about, call `report-finding` again with
> the corrected line.

[Run 12](../releases/v0.7/RUNS.md) obeyed it. The agent reported one defect at line 26, read
back the signature of a different method, reported at line 22, read back a closing brace,
reported at line 21, and read back the line it meant. **Line 21 was exactly right.**

The report therefore contained the same defect three times, two of them citing lines the
claim was not about. Scoring made it worse: the matching rule awards a defect to the first
citation landing inside the keyed span, so the closing brace was scored as the match and the
correct line as a duplicate. The agent's best work counted as redundant.

**The instruction was right and the tool could not express it.** An agent that ignored the
instruction produced a cleaner report than one that followed it, which is a contract defect
rather than a prompt problem.

It also put two instructions in the same goal into direct conflict:

- "call `report-finding` again with the corrected line"
- "report the clearest instance rather than repeating it"

Neither could be obeyed without breaking the other.

## Decision

`report-finding` gains an optional `replaces` argument and returns a `findingId`.

```text
report-finding { path, line, endLine, severity, claim, replaces }
  -> { recorded: true, findingId, replaced, totalFindings, evidence }
```

A call with `replaces` set to a known id **overwrites that finding in place**, keeping its id
and its position in the report. A correction is the same finding said better, so it does not
become a second entry and does not move to the end.

`replaces` is `.nullable().optional()`, for the reason recorded on `line` in
[ADR-017](ADR-017-typed-tool-arguments.md): strict Structured Outputs requires every property
to be present, so `null` is what the model sends when it means nothing.

### Rejected: merging findings that look alike

The alternative was to deduplicate automatically — same path and same claim text, last write
wins — which needs no cooperation from the model and would have fixed run 12 without a schema
change.

It was rejected because it makes deterministic code decide which findings are _the same_,
which is a judgement rather than a validation, and this repository's boundary is that agents
propose while deterministic software validates and executes. It also fails on a real case: an
agent reporting one genuine claim about two different locations in one file, in identical
words, would have them silently collapsed into one and nothing would say so.

An explicit id keeps the agent proposing the correction and the tool validating it.

### Rejected: falling back to appending when the id is unknown

An unknown id throws, and the failure becomes a tool observation the agent can act on rather
than a decision failure that ends the run. Appending a finding the agent asked to _replace_
is the exact defect being fixed; doing it silently on a typo would be worse than failing.

## Consequences

The goal now tells the agent to use `replaces`, so the two conflicting instructions can both
be obeyed.

Any future tool that accumulates results inherits this question. The general shape: **a tool
whose results accumulate, used by an agent told to check its own work, needs a way to correct
an entry — otherwise the instruction to self-correct makes the output worse.**

This is unverified live. Run 12 is the evidence that the defect is real; nothing yet shows
the agent will use `replaces` when offered it. Thirteen tests cover the mechanism, including
run 12's exact three-call sequence now producing one finding. Whether the model reaches for
it costs a run to find out, and the evaluation harness from v0.7 is what will say whether it
helped — the duplicate rate and citation accuracy are already measured.

The matching rule is unchanged. Order still decides duplicates, because judging which of two
findings is better written remains something this repository refuses to automate. With
`replaces` there is no second finding to rank.
