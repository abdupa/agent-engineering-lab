---
name: release
description: Run the release cycle for the active milestone — spec, build, verify, review, close. Use when starting or completing a release milestone named in docs/CURRENT.md.
---

# Release cycle

One milestone at a time. Read `docs/CURRENT.md` first; it names what is active.

## 1 · Specify

Create or open `docs/releases/<version>/SPEC.md`. It must open with:

> **The product requirement that earns this release:** …

A concrete user need. If you cannot name one, stop — the release is not ready, and
something the product actually needs should be built instead.

The SPEC also states: goal, architecture direction, preserved boundaries, required
distinctions, milestones with exit criteria, non-goals, and what it will not prove.

It must also carry **the reliability policy and what the release emits** — the twelve
questions in [docs/CROSS_CUTTING.md](../../../docs/CROSS_CUTTING.md). A SPEC missing
those is incomplete, regardless of how well the capability is specified.

## 2 · Build

One milestone at a time. Tests and documentation are part of the implementation, not
follow-up work. Classify missing decisions with `docs/DECISION_POLICY.md`:

- L1 — decide and continue
- L2 — decide, write an ADR if it shapes future work, continue
- L3 — **stop and ask**

## 3 · Verify

Run `/verify`. Read the whole verdict. Do not proceed on a partial gate.

## 4 · Review

At the end of the release, write `REVIEW.md`: execution model, architecture findings
(premature abstractions, duplication, coupling, responsibilities, dead code, resource
cost, error boundaries), evidence, and limitations. A review that finds nothing should
say what it looked for.

## 5 · Audit the claims

Run `/claims-audit` across everything the release touched.

## 6 · Close

`RELEASE.md` records delivered scope, real counts, and honest limits. Then update
`docs/CURRENT.md`, `docs/ROADMAP.md` and the README. Review every gated pattern in
`docs/PATTERNS.md` — record the trigger firing, or record "still not triggered".

## Completion report

Files changed · validation results with real numbers · limitations · concerns ·
autonomous decisions with level and rationale · pattern advanced and what it now proves ·
next planned task, named but not started.
