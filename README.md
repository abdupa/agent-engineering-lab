# Agent Engineering Lab

A library of reusable agent architecture patterns — each built, tested, and documented
with its real limits — plus one production product that earns them.

Not a framework. Not thirty demos. Roughly ten architectures, and a recorded reason for
everything deliberately left out.

## Start here

| Document | Question it answers |
| --- | --- |
| [CLAUDE.md](CLAUDE.md) | How do we work? |
| [docs/CHARTER.md](docs/CHARTER.md) | What is this for, and what is it worth? |
| [docs/PATTERNS.md](docs/PATTERNS.md) | Which agent architectures do we build, and which do we not? |
| [docs/ROADMAP.md](docs/ROADMAP.md) | In what order, and what earns each release? |
| [docs/CURRENT.md](docs/CURRENT.md) | What is active right now? |
| [docs/CROSS_CUTTING.md](docs/CROSS_CUTTING.md) | What every pattern owes regardless of what it does |
| [docs/DECISION_POLICY.md](docs/DECISION_POLICY.md) | Who decides what, and when do we stop and ask? |
| [docs/adr/](docs/adr/) | Why was a significant decision made? |

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
