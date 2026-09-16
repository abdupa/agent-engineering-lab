---
name: pattern
description: Scaffold or review an agent architecture pattern from the catalogue in docs/PATTERNS.md. Use when starting a new pattern, or when deciding whether a requested agent needs a new pattern or composes from existing ones.
---

# Agent pattern

Two uses: deciding whether something needs a new pattern, and building one.

## A · Does this need a new pattern?

When someone asks for an agent — a client, a requirement, a catalogue entry — decompose
it before building it.

1. **Name its boundaries.** What is deterministic? What is probabilistic? Where does
   validation happen? What holds authority to act?
2. **Match against `docs/PATTERNS.md`.** Which existing patterns cover each boundary?
3. **Ask what is left.** If the remainder is domain knowledge, it is a composition —
   assemble it, do not architect it. If the remainder is a genuinely new boundary or
   failure mode, it is a new pattern.

Write the decomposition down either way. The legal-agent example in PATTERNS.md is the
model:

```
<Requested agent>
  = <pattern> ...what it contributes
  + <pattern> ...what it contributes
  + <what is genuinely new, if anything>
```

If nothing is genuinely new, say so plainly. That is a useful answer, not a refusal.

## B · Building a new pattern

Follow the order this repository has used since v0.1. It is slower at the start and
faster afterwards.

1. **Contracts first.** Provider-neutral types with runtime validation. No storage, no
   provider, no integration yet.
2. **The simplest implementation that demonstrates the architecture.** Deterministic if
   possible. A baseline you can explain beats a sophisticated one you cannot.
3. **The boundary it must not cross.** State what this pattern is _not_ allowed to do,
   and test that it does not.
4. **Reliability policy.** Failure modes — invalid input, timeout, cancellation, empty
   result, partial result, dependency unavailable. Which are retryable and under what
   budget; which are terminal. Whether it fails open or closed, and why. If it has real
   side effects, what makes repetition safe. Each gets a test.
5. **Observability.** What it emits on success, on failure, and at boundaries. What must
   **never** be emitted — payloads, prompts, credentials, memory contents, permission
   grants, raw provider errors. How correlation flows through it. Then the acceptance
   test: _given only the logs, can an operator say which boundary failed?_ If not, the
   pattern is not done.
6. **Evaluation.** Labeled fixtures with exact expected outcomes where policy defines
   them. What would a regression look like?
7. **Limits.** What the tests prove, and what they do not. Run `/claims-audit`.
8. **ADR** if the decision shapes future architecture.

Steps 4 and 5 are not optional and not deferrable. See
[docs/CROSS_CUTTING.md](../../../docs/CROSS_CUTTING.md) for the twelve questions and for
the new surface each planned pattern introduces — async execution and code execution in
particular are much larger jumps than they look.

## Required distinctions

Every pattern document names the confusions it prevents. Examples already on the record:

- discovery ≠ permission ≠ execution
- checkpoint ≠ restore ≠ resume ≠ retry
- retrieved ≠ included ≠ cited ≠ supported ≠ true
- storage ≠ selection policy
- structural validity ≠ quality

Name yours. If you cannot, the pattern is probably not distinct.
