# Charter — goal, objective, value

## Goal

Build a library of reusable agent architecture patterns, each one implemented, tested,
and documented with its real failure modes — so that any agent a client asks for can be
assembled from parts already understood, rather than designed from scratch under
deadline.

## Objective

Reach the point where, for any agent system:

- You can **design** it — name its patterns, draw its boundaries, choose what is
  deterministic and what is probabilistic.
- You can **defend** it — explain why each component exists, what simpler design was
  rejected, and what requirement earned the complexity.
- You can **debug** it — given a failing run, locate which boundary failed from the
  logs alone.
- You can **bound** it — state exactly what the evidence proves and what it does not.

The last one is the differentiator. The first three are increasingly common.

## The thesis

Imran Ahmad's _30 Agents Every AI Engineer Must Build_ lists thirty agent types. Most
of them are **the same small set of architectures wearing different domain knowledge.**

A legal intelligence agent is document intelligence + retrieval + verification.
A healthcare agent is retrieval + verification + calibrated uncertainty.
A financial advisory agent is planning + verification + approval gates.

Build the architectures once. Compose the domains on demand.

That is why this repository implements roughly ten patterns rather than thirty agents,
and why [docs/PATTERNS.md](PATTERNS.md) records a decision for every one of the thirty
— built, gated, folded, or deliberately skipped, each with a reason.

## Value

### For client engagement

| What you can do                                                | Because                                                                          |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Answer "can you build us X?" with an architecture, not a guess | X decomposes into patterns you have built and measured                           |
| Quote scope credibly                                           | You know which parts are two days and which are two weeks, from having done them |
| Produce architecture rationale on demand                       | Every ADR here is a client-ready justification document in miniature             |
| Win trust in a room full of overclaiming                       | You arrive with measured limits, not a demo                                      |
| Say no with evidence                                           | "Multi-agent will not help here, and here is the measurement that shows it"      |
| Hand over something maintainable                               | Contracts, tests, and recorded decisions, not a notebook                         |

### For capability

- **Framework independence.** You build the loop, the state machine, the memory
  selection policy and the approval gate by hand. When a framework is proposed, you
  judge it against something you have built, not against its marketing.
- **Evaluation fluency.** The scarcest skill in this field. Most engineers can wire an
  agent; very few can produce an evaluation claim they would defend to a skeptic.
- **Operability.** Every pattern here states its failure policy and what it emits before
  it is called done — see [CROSS_CUTTING.md](CROSS_CUTTING.md). The question a client
  eventually asks is not "does it work?" but "how will we know when it stops?"
- **Production instinct.** Auth, deploys, incidents, cost and data lifecycle are not
  overhead here — they are half the subject, and a real product is the only way to
  meet them.

### For the record

Sixteen ADRs and counting, each stating context, decision, alternatives and limits.
A written record of engineering judgement is rarer and more persuasive than a portfolio
of code.

## What this is not

- Not a framework. Nothing here is packaged for other people to depend on.
- Not thirty agents. Ten patterns and an explicit, reasoned decision about the rest.
- Not a demo collection. Every pattern ships with tests and stated limits or it does
  not ship.
- Not a proof of mastery. Passing gates measure the system. The person is measured by
  whether they can explain it without notes.

## Inheritance

This repository succeeds the AI Engineering Laboratory (v0.1–v0.5, 468 tests, 16 ADRs,
released September 2026). That work is carried forward intact: the provider boundary,
tool system, bounded agent loop, orchestration state machine and retrieval subsystem
are all reused, not rewritten.

The v0.5 study guide is kept at [docs/reference/v0.5-study-guide.md](reference/v0.5-study-guide.md)
as **reference material**. It is no longer the canonical curriculum; this charter,
[PATTERNS.md](PATTERNS.md) and [ROADMAP.md](ROADMAP.md) are.
