# Current work

Project: Agent Engineering Lab

Release: v0.6 — Memory

Current task: **V0.6-000 — Product requirement and SPEC**

Status: **Not started**

## State

The repository is newly established. Code, ADRs and concept documents are carried forward
from the AI Engineering Laboratory (v0.1–v0.5, 468 tests, 25 suites, 16 ADRs). No new
pattern is implemented yet.

Governance, charter, pattern catalogue and roadmap are written. See
[CHARTER.md](CHARTER.md), [PATTERNS.md](PATTERNS.md), [ROADMAP.md](ROADMAP.md).

## Blocking decision

**The product has not been named.**

Every release in this repository must open its SPEC with the product requirement that
earns it. v0.6 Memory cannot start until there is a product whose users return and whose
constraints are worth remembering.

Recommended candidate: an AI engineering audit agent — plans an audit of a repository or
system, runs tools against a rubric, produces findings with evidence, and requires human
approval before anything reaches a client. It scores on all six selection criteria in the
charter, and past audits provide labeled ground truth for the evaluation release.

This is an L3 decision. It waits for Abe.

## Next

1. Name the product. Write its one-page brief.
2. V0.6-000 — write `docs/releases/v0.6/SPEC.md`, opening with the requirement that earns it.
3. V0.6-001 — memory domain contracts and taxonomy.

A planned task is not authorization to start it.

## Verification

Carried-forward test suite re-run in this repository: **468 passed, 25 suites**.
Typecheck clean. Full `pnpm verify` not run locally — pnpm is not installed on this
machine; see `/verify` for the direct commands.
