# v0.6 — live run records

Evidence from real model calls. Each entry records what happened, not what was hoped for.

---

## Run 4 — the prompt fix worked, and exposed the real bug

Date: 2026-09-16 · `gpt-5.6-luna` · same target · cap 12

**Outcome: `DECISION_FAILED` at step 3. Zero findings. But a much better failure.**

```
list-files → read-file → [attempt to report] → unparseable_json
```

### The prompt fix did what it was meant to

Run 3 read eight files before failing. This run read **one**, then went straight for a
report. The instruction to report before moving on changed the strategy exactly as
intended — and in doing so moved the failure from step 10 to step 3, onto the reporting
path, where the actual defect lives.

Input tokens fell from 41,677 to 3,487 for the same target.

### The new diagnostic disproved the standing hypothesis

The previous record guessed truncation, on the grounds that failing calls had unusually
high output-token counts. The diagnostic added in response says otherwise:

```
provider_invalid_output  reason: unparseable_json
```

Not `not_completed`. The response was complete and the envelope itself would not parse.
One run of a cheap diagnostic replaced a plausible guess with a fact, and the guess was
wrong.

### Current hypothesis, and why it is only that

Both failures so far carry high output-token counts (220 and 263) against 56-110 on every
successful step, and both occur where the agent is constructing a finding.

`AgentDecisionTransportSchema` carries tool arguments as `argumentsJson: string` — JSON
encoded inside a JSON string, the v0.3-002 workaround for Structured Outputs not accepting
arbitrary objects. A finding's `evidence` field holds source code: quotes, braces,
newlines. Every one of those has to be escaped correctly inside that string, and an
under-escaped quote makes the **outer** envelope unparseable, which is exactly the
observed failure.

**This remains a hypothesis.** The rejected text is not logged, so nothing here has seen
it. Run 5 will decide it: the diagnostic now also records `endsWithBrace`,
`outputTextLength`, `quoteCount` and `backslashCount`. Output that ends in a closing brace
and still will not parse is an escaping fault; output that does not is truncation wearing
a `completed` status. A capped 400-character sample is available behind
`PROVIDER_DEBUG_INVALID_OUTPUT=1`, off by default because model output can contain
anything.

If the hypothesis holds, the fix is architectural rather than a prompt tweak, and it lands
on a contract in place since v0.3.

### Measurements

3,823 tokens. 9.6 seconds for three steps.

Record: `docs/releases/v0.6/runs/2026-09-16T07-11-23-100Z.json`

---

## Run 3 — first audit of real code. Failed, informatively.

Date: 2026-09-16 · `gpt-5.6-luna` · `AUDIT_ROOT=apps/api/src/audit` (13 files) · cap 12

**Outcome: `DECISION_FAILED` after 10 iterations and 9 tool calls. Zero findings.**

```
list-files → read × 8 → INVALID_OUTPUT
```

### Three separate problems, none of which the fixture run could have shown

**1. It read everything and reported nothing.** Nine of twelve steps went to reading. It
never called `report-finding` once. The goal said "investigate before concluding", which
on a 13-file directory it read as "read all thirteen first". With a step budget, that
strategy cannot produce a finding.

Fixed: the goal now says to report each defect before moving on, and states plainly that
an audit reporting two real defects and stopping early beats one that runs out having
reported nothing.

**2. `INVALID_OUTPUT` said nothing useful.** The tenth decision was rejected and the log
gave one word. Truncation, unparseable text and a schema mismatch are different failures
needing different responses, and all three surfaced identically.

Fixed: the provider now records _why_ — `not_completed` with the provider's own
`incomplete_details.reason`, `unparseable_json`, `schema_rejected`, or
`empty_output_text`. The error code is unchanged, so the HTTP contract is untouched; only
the log grew. The rejected value is never logged.

The most likely cause, unconfirmed: output was truncated. Output tokens on the failing
call were 263 against 60-110 on every successful one. The next failure will say so
outright instead of leaving it to inference.

**3. Context growth is now a measured wall, not a prediction.**

| Step | Input tokens | Delta  |
| ---- | ------------ | ------ |
| 1    | 521          | —      |
| 2    | 612          | +91    |
| 3    | 1,655        | +1,043 |
| 4    | 3,119        | +1,464 |
| 5    | 4,291        | +1,172 |
| 6    | 5,158        | +867   |
| 7    | 5,753        | +595   |
| 8    | 6,301        | +548   |
| 9    | 6,842        | +541   |
| 10   | 7,425        | +583   |

**41,677 input tokens to produce nothing**, against 4,114 for the two-file fixture. State
is resent every step, so cost grows with the square of the step count. Thirteen small
files nearly exhausted a twelve-step budget on reading alone.

This is the requirement that earns memory and planning. Not a roadmap entry any more — a
number.

### What this does not establish

Nothing about audit quality: it produced no findings to judge. It establishes that the
prompt strategy and the step budget were wrong together, and that the failure diagnostics
were too coarse to explain why. All three are now different; none is verified by a further
live run yet.

### Measurements

42,829 tokens total. 33.2 seconds for ten steps, ~3.3s each — an audit that must not hold
an HTTP request open.

Record: `docs/releases/v0.6/runs/2026-09-16T06-52-14-655Z.json`

---

## Run 2 — probe against the throwaway fixture

Date: 2026-09-16 · `gpt-5.6-luna` · `PROBE_MAX_ITERATIONS=8`

### Stage 1 — schema compatibility

**Passed.** The live Structured Outputs API accepted `AgentDecisionTransportSchema` and
returned a translatable `finish`. 242 tokens.

That schema was designed for provider compatibility in v0.3-002 and had only ever been
checked against an offline conversion test. Every release since assumed it worked. It now
has evidence.

### Stage 2 — two-file audit

Trajectory, 6 iterations and 5 tool calls, ending in `success`:

```
list-files → read-file → read-file → report-finding → report-finding → finish
```

It surveyed before reading, read both files before reporting, and reported through the
tool rather than in prose. That is the intended shape, unprompted by a script.

### Both planted defects found

| Finding                                                                            | Correct? |
| ---------------------------------------------------------------------------------- | -------- |
| `parse.ts:3` — untrusted body passed to `JSON.parse` with no validation (high)     | Yes      |
| `README.md:3` — documentation claims validation that the code does not do (medium) | Yes      |

### Evidence verified by hand

The fixture is known exactly, so every claim was checkable.

`parse.ts` line 3 is `  return JSON.parse(raw);` — the cited line is correct. The quoted
evidence spans lines 1-4, the whole function, and contains the cited line.

`README.md` line 3 is `parsePayload validates all input before parsing it.` — line number
and quoted text both exact.

**No invented paths, no invented evidence, no finding on a file it had not read.**

### What this does not establish

One run, two planted defects, a two-file fixture with an answer key. It shows the
mechanism works end to end. It says nothing about finding subtle defects in an unfamiliar
codebase, where nothing marks what should be found.

A gap the run surfaced without breaking: **nothing checks that `line` and `evidence` agree.**
The first finding cites line 3 and quotes lines 1-4. That is defensible here and harmless,
but no code enforces the relationship. Verification is v1.1, and this is what its absence
looks like when the model happens to be honest.

### Measurements

|                |                                                                    |
| -------------- | ------------------------------------------------------------------ |
| Cost           | 5,002 tokens total across 7 calls. Not a constraint at this scale. |
| Latency        | 16.2s for the 6-step audit, ~2.7s per step                         |
| Context growth | 514 → 555 → 632 → 692 → 813 → 908 input tokens                     |

**Context growth is the number to watch.** Each observation adds to a state that is resent
on every subsequent step, so total input grows roughly with the square of the step count.
Here the files were tiny and each observation added 40-120 tokens. `read-file` defaults to
a 64,000-byte budget — roughly 16k tokens for a single large file, resent every step after.
Nothing measured yet says that default is wrong; the next run against real source files is
what would show it.

Latency is the async requirement (v0.8) arriving with a number: a 20-step audit at this
rate is around a minute, which no HTTP request should be holding open.

---

## Run 1 — first probe, cap of 2

Date: 2026-09-16 · `gpt-5.6-luna` · cap 2

Stage 1 passed identically. Stage 2 reached `LOOP_LIMIT` after `list-files` and
`read-file`.

**The agent behaved correctly; the cap made success impossible.** A useful audit needs at
minimum list → read → report → finish, and the cap allowed two steps. Raised to 8 and made
configurable.

The run also exposed a real defect: the report said `toolCalls: 0` while the runner logged 2. The failure path had been filling `toolCalls` from `findings.length` — a different
number entirely. Fixed in `b2e108f` by counting executor calls, with a regression test
reproducing this exact shape.

That defect was invisible to 565 passing tests, because no scripted trajectory had ever
produced a failure that made tool calls but recorded no findings.
