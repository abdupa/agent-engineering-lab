# Agent Engineering Lab

[![verify](https://github.com/abdupa/agent-engineering-lab/actions/workflows/verify.yml/badge.svg)](https://github.com/abdupa/agent-engineering-lab/actions/workflows/verify.yml)

A library of reusable agent architecture patterns — each built, tested, and documented
with its real limits — plus one production product that earns them.

Not a framework. Not thirty demos. Roughly ten architectures, and a recorded reason for
everything deliberately left out.

## Start here

| Document                                           | Question it answers                                         |
| -------------------------------------------------- | ----------------------------------------------------------- |
| [CLAUDE.md](CLAUDE.md)                             | How do we work?                                             |
| [docs/CHARTER.md](docs/CHARTER.md)                 | What is this for, and what is it worth?                     |
| [docs/PATTERNS.md](docs/PATTERNS.md)               | Which agent architectures do we build, and which do we not? |
| [docs/ROADMAP.md](docs/ROADMAP.md)                 | In what order, and what earns each release?                 |
| [docs/CURRENT.md](docs/CURRENT.md)                 | What is active right now?                                   |
| [docs/CROSS_CUTTING.md](docs/CROSS_CUTTING.md)     | What every pattern owes regardless of what it does          |
| [docs/DECISION_POLICY.md](docs/DECISION_POLICY.md) | Who decides what, and when do we stop and ask?              |
| [docs/adr/](docs/adr/)                             | Why was a significant decision made?                        |

## The thesis

Most of the thirty agents in the standard catalogue are the same small set of
architectures wearing different domain knowledge. A legal agent is document intelligence
plus retrieval plus verification. Build the architectures once; compose the domains on
demand. [PATTERNS.md](docs/PATTERNS.md) carries a verdict on all thirty.

## Built so far

Carried forward from the AI Engineering Laboratory: provider boundary with runtime
validation, a permissioned tool system, a bounded agent loop, an orchestration state
machine with checkpoint and pause semantics, and a retrieval subsystem with grounded
generation and citation integrity.

**468 tests across 25 suites. 16 ADRs.** Two catalogue patterns complete (#1 Autonomous
Decision-Making, #10 Tool-Using), one partial (#4 Knowledge Retrieval).

## Commands

```sh
pnpm install --frozen-lockfile
cp apps/api/.env.example apps/api/.env   # set OPENAI_API_KEY and OPENAI_MODEL
pnpm dev            # API with reload
pnpm test           # deterministic suite; no live model calls
pnpm verify         # the full gate: format, lint, typecheck, test, build, diff
```

Node 22.13+ on the 22.x line, or 24.x. pnpm 10.30.3.

If pnpm is unavailable, `apps/api/node_modules/.bin/jest --runInBand` runs the suite and
`apps/api/node_modules/.bin/tsc --noEmit` typechecks.

## Audit endpoint

```sh
curl -X POST http://127.0.0.1:3000/audit \
  -H 'Content-Type: application/json' \
  -d '{"rubric":"Unsafe handling of untrusted input"}'
```

Runs the agent over the directory named by `AUDIT_ROOT` and returns findings, each with
a file, an optional line, a severity, a claim and the evidence it relied on, plus a
`usage` block recording what the run spent.

**The request carries no path.** What may be read is configuration, not input, so the
transport offers nothing to point somewhere else. Inside that root, `.env*`, `*.key`,
`*.pem`, `.git/` and `node_modules/` are refused, absolute paths and `..` are rejected,
and symlinks are resolved and re-checked.

A run that fails after recording findings returns HTTP 200 with
`status: "incomplete"` and the reason — partial work is real work. A run that fails
having recorded nothing maps to 502, 503, 504 or 500 by cause, except a step-limit
exhaustion, which is an ordinary incomplete result rather than a server error.

This request makes real OpenAI calls, one per agent step.

## Manual live verification

Nothing below runs during tests, startup or CI. Each makes real, billable requests.

```sh
pnpm smoke:openai   # research schema against the live provider
pnpm probe:agent    # the agent decision schema, then a short audit of a fixture
pnpm audit:live     # audit the real AUDIT_ROOT and save the run as evidence
```

`audit:live` writes each run to `docs/releases/v0.6/runs/` so results become evidence
rather than terminal scrollback. Step budget via `AUDIT_MAX_ITERATIONS` (default 12),
focus via `AUDIT_RUBRIC`.

`probe:agent` runs two stages, cheapest risk first:

1. **Schema probe — one request.** Does the live Structured Outputs API accept
   `AgentDecisionTransportSchema`? That has only ever been checked against an offline
   conversion test. If this fails, nothing after it matters.
2. **Two-step audit — at most two requests**, against a temporary fixture the script
   creates and deletes. It never reads `AUDIT_ROOT`, so a probe cannot wander into a real
   codebase.

At most three billable requests. Both scripts need `OPENAI_API_KEY`, `OPENAI_MODEL` and
`AUDIT_ROOT` set, because both boot the full application context.

### Tokens and cost

Every provider generation logs `inputTokens` and `outputTokens` on its `provider_execution`
event, summed across SDK retries, and `POST /audit` returns a `usage` block for the run.

**Cost is reported only if you supply rates.** Set `OPENAI_INPUT_COST_PER_MTOK` and
`OPENAI_OUTPUT_COST_PER_MTOK` (price per million tokens) and optionally
`OPENAI_COST_CURRENCY`. Unset, you get tokens and an explicit "cost unavailable" — a
pricing table hardcoded here would go stale silently and report a confident wrong number.

Token counts are read from the provider response inside the OpenAI adapter, so any fake
provider reports zero. In tests, `usage` is zero everywhere, and correctly so.

### Token budget

`AUDIT_MAX_TOKENS` caps what one audit may spend. Checked between steps, so a run can
overshoot by the single call that crossed the line — a ceiling that stops the next call,
not a hard cap on the current one. Unset means unbounded, which is what steps and wall
time alone give you.

A run that hits it returns HTTP 200 with `status: "incomplete"` and
`reason: "BUDGET_EXCEEDED"`, keeping whatever it found. The agent ran correctly and spent
what it was allowed; that is an outcome, not a fault.

## Skills

Four Claude Code skills encode the disciplines that matter, so they run instead of being
remembered:

- `/verify` — the gate, read honestly, never chained to a push
- `/claims-audit` — does any document claim more than the tests prove?
- `/release` — spec → build → verify → review → close
- `/pattern` — does this need a new architecture, or does it compose from existing ones?

## Claim discipline

Every document here states what its evidence proves **and what it does not**. A passing
suite proves mechanics, not quality. A citation proves reference, not support. Fixtures
prove known scenarios, not production behaviour.

That rule is the most valuable thing in this repository. It is checked, not assumed.

## Governance is tested

`apps/api/test/governance/` asserts that every active release SPEC carries its earning
requirement, reliability policy, observability section and honest limits — and that the
governance documents' links resolve. It runs inside `pnpm test`, so a drifting session
breaks the build rather than quietly skipping a rule.

## Reference

[docs/reference/v0.5-study-guide.md](docs/reference/v0.5-study-guide.md) — the previous
curriculum, kept as source material. Superseded by the charter, pattern catalogue and
roadmap.
