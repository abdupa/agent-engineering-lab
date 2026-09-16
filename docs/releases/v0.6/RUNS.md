# v0.6 — live run records

Evidence from real model calls. Each entry records what happened, not what was hoped for.

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
