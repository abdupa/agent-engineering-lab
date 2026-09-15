# How we work

Read [docs/CURRENT.md](docs/CURRENT.md) first. It names the active release, the active
task, and its status. Then read that release's `SPEC.md` and any ADR it references.

The repository is the source of truth. Conversation history is not. If a decision
matters, it is written down here before the session ends.

## Instruction priority

1. Explicit instruction from Abe
2. The active release `SPEC.md`
3. Relevant ADRs
4. This file
5. General repository conventions

## What this repository is

A library of **reusable agent architecture patterns**, each built, tested, and
documented with its real limits — plus one production product that earns them.

See [docs/CHARTER.md](docs/CHARTER.md) for goal, objective and value.
See [docs/PATTERNS.md](docs/PATTERNS.md) for which patterns we build and which we do not.
See [docs/ROADMAP.md](docs/ROADMAP.md) for the release plan.

## Engineering principles

1. Requirements drive architecture. No infrastructure for hypothetical needs.
2. Start simple and earn complexity.
3. Deterministic software handles deterministic problems. AI handles probabilistic
   reasoning. Do not replace ordinary computation with a model call.
4. Provider details stay behind application interfaces.
5. Validate AI-generated structured data at runtime. Types are not validation.
6. Agents propose. Deterministic software validates, authorizes and executes.
7. Reliability, testing, security and observability are part of the feature — never
   cleanup work, never a later release. See [docs/CROSS_CUTTING.md](docs/CROSS_CUTTING.md).
8. Significant architecture decisions are recorded as ADRs.

## Claim discipline

This is the rule that matters most here, and it is not negotiable.

**Never describe planned capability as implemented. Never claim evidence you do not have.**

Every release document states what its tests prove *and what they do not*. A passing
suite proves mechanics, not quality. A citation proves reference, not support. A
deterministic fixture proves a known scenario, not production behaviour.

When reporting results: if tests fail, say so and show the output. If a step was
skipped, say which. If something is done and verified, say it plainly without hedging.

Run `/claims-audit` before closing any release.

## Every release names its requirement

A release is not earned by appearing in the roadmap. Each `SPEC.md` must open with:

> **The product requirement that earns this release:** …

A concrete user need, stated before any code. If you cannot name one, the release is
not ready — build what the product actually needs instead, and let the roadmap wait.

## Every release carries its cross-cutting obligations

Alongside that requirement, each SPEC states **its reliability policy and what it emits**.
A pattern with no failure policy is not finished; a pattern you cannot observe is not
operable. [docs/CROSS_CUTTING.md](docs/CROSS_CUTTING.md) holds the twelve questions every
SPEC answers, and the new surface each planned pattern introduces.

These are obligations carried by every release, not a release of their own. Nothing on
the roadmap is allowed to become "the observability release".

## Decision authority

Classify missing decisions by consequence, using [docs/DECISION_POLICY.md](docs/DECISION_POLICY.md).

- **L1** — local, reversible, testable. Decide, implement, test, report.
- **L2** — architecturally meaningful but inside the active SPEC and reversible.
  Decide, write an ADR when it shapes future work, continue.
- **L3** — security, auth, persistent storage, external services, breaking changes,
  irreversible operations, new runtime boundaries. **Stop before implementing.**
  State the missing decision, recommend the smallest option, wait for authorization.

Missing detail alone is not a reason to stop. Several reasonable low-risk options is
not a reason to stop. Escalate on consequence, not ambiguity.

Expect L3 to fire often once the product has real users. That is the policy working.

## When product and curriculum collide

Product wins. The curriculum waits.

If the product needs something that is three releases away, build it now and record
why the order changed. If the curriculum's next release has no product requirement
behind it, do not build it yet.

## Working conventions

- Use pnpm. Commit the lockfile when dependencies change.
- Keep secrets and local `.env` files out of version control.
- Keep changes inside the active task.
- Update documentation with the implementation, not after it.
- Update `docs/CURRENT.md` when a task completes. A planned next task is not
  authorization to start it.
- Run `/verify` before declaring any milestone complete.

## Completion reports

When a task is done, report:

- Files changed
- Validation results — actual command output, actual counts
- Limitations and deferred work
- Concerns
- **Autonomous decisions:** what, which level, why, what else was considered, where it
  lives, ADR reference for L2
- **Pattern demonstrated:** which agent pattern this advances, and what it now proves
- Next planned task — named, not started
