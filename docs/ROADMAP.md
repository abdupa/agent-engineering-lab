# Roadmap

Ten patterns to build, six gated on evidence. Each release earns its place by naming a
product requirement before any code is written — see [CLAUDE.md](../CLAUDE.md).

A roadmap entry is not authorization. [CURRENT.md](CURRENT.md) names what is active.

## Carried forward — already built

| Release | Delivered                                                                                           | Patterns                         |
| ------- | --------------------------------------------------------------------------------------------------- | -------------------------------- |
| v0.1    | Provider boundary, structured output, runtime validation, reliability, observability                | foundation                       |
| v0.2    | Tool contracts, registry, permissioned executor, deadlines, cancellation                            | #10 Tool-Using                   |
| v0.3    | Bounded agent loop, decision contracts, trajectory evaluation                                       | #1 Autonomous Decision-Making    |
| v0.4    | Orchestration state machine, checkpoint / restore / resume, intentional pause                       | foundation for #12               |
| v0.5    | Chunking, lexical + semantic retrieval, context assembly, grounded generation, retrieval evaluation | #4 Knowledge Retrieval (partial) |

468 tests across 25 suites. 16 ADRs. See [docs/releases/](releases/).

## Scheduled

Renumbered twice on 2026-09-17, both times to close the same gap. First the table listed
v0.6 as Memory while the SPEC and CURRENT had already moved it to the first agent. Then
the reorder below was written as prose and the table underneath it was left alone, so the
note and the rows it described disagreed for one commit. A governance test now compares
this table against CROSS_CUTTING.md and CURRENT.md, because reading two documents side by
side is exactly the check nobody performs twice.

| #   | Release                        | Pattern                      | The requirement that earns it                                                                |
| --- | ------------------------------ | ---------------------------- | -------------------------------------------------------------------------------------------- |
| 1   | **v0.6 — First agent**         | #1, #10 applied              | An auditor needs findings on a codebase without reading every file by hand.                  |
| 2   | **v0.7 — Evaluation**          | —                            | Quality regresses silently when a prompt or model changes. Catch it before a reviewer does.  |
| 3   | **v0.8 — Verification**        | #8 Verification & Validation | An answer cites its evidence and is still wrong. Citation is not support.                    |
| 4   | **v0.9 — Second agent**        | #5, #4 extended              | A reviewer needs the risky clauses in a contract, with the clause text attached.             |
| 5   | **v1.0 — Async execution**     | #12 (part 1)                 | A job runs for minutes. Submit and be notified; no held connection.                          |
| 6   | **v1.1 — Guardrails & HITL**   | #12 (part 2), #23 folded in  | Nothing reaches a client without a human approving it.                                       |
| 7   | **v1.2 — Memory**              | #3 Memory-Augmented          | A reviewer returning next week gets an agent that already knows their constraints.           |
| 8   | **v1.3 — Planning**            | #2 Planning                  | Work needs more than one tool call, and a bad plan wastes time and money.                    |
| 9   | **v1.4 — Code execution**      | #7 Data Analysis             | A question needs computation over data, not retrieval of prose.                              |
| 10  | **v1.5 — Compliance / policy** | #14 Compliance / Security    | Output must satisfy a written policy before it is allowed to leave.                          |
| 11  | **v1.6 — Explainability**      | #24 Explainable              | A reviewer must audit why the agent concluded what it concluded.                             |
| 12  | **v1.7 — Operator console**    | —                            | Someone must watch runs, approve the gates v1.1 created, and debug a failure.                |
| 13  | **v1.8 — TDD code generation** | #13 Code-Generation          | The agent writes code, and the only trustworthy correction signal is a failing test.         |
| 14  | **v2.0 — Extraction**          | —                            | Patterns that proved themselves in production become reusable deliberately, not by accident. |

### Reordered 2026-09-17, by evidence

Evaluation and verification moved ahead of the second agent after
[run 11](releases/v0.6/RUNS.md): the agent recorded three findings against real code and
**one of the three citations was accurate**. All three were the same observation applied
to three files, rated high each time, for a defect requiring an attacker who already has
write access.

Nothing in the repository can say whether one-in-three is good, whether a prompt change
improves it, or whether a later change makes it worse. Building a second agent first would
have produced two agents nobody can measure instead of one.

Verification follows evaluation rather than leading it — a checker comparing claim against
evidence would have caught two of those three, and without a baseline there is no way to
show that it did.

### Order is a direction, not a queue

A roadmap entry is not authorization, and this list is not a sequence to drain. Build what
the product needs next and record why the order changed. **Memory and planning moved down**
because the first two agents have no returning users and no multi-step goals yet — building
either now would be infrastructure for a need that does not exist.

Three dependencies are real rather than conventional:

```
guardrails  ──before──►  code execution   untrusted code needs an approval boundary first
evaluation  ──before──►  self-improving   a policy cannot improve without measurement
async       ──before──►  anything long    a five-minute job cannot hold a request open
```

### Every row above also carries

Reliability and observability are not rows in this table because they are obligations of
**all** of them. Each release states its failure policy and what it emits, per
[CROSS_CUTTING.md](CROSS_CUTTING.md) — which also names the specific new surface each of
these introduces. Async execution (v1.0) and code execution (v1.4) are far larger jumps
than their one-line requirements suggest.

The predecessor repository did this by giving every layer its own instrumentation
milestone. Same obligation here, enforced through the SPEC instead of the schedule.

### Ordering notes

**Evaluation (v0.7) sits deliberately early.** It is the instrument every later decision
depends on — whether verification helps, whether multi-agent wins, whether a change made
things worse. Building it late means guessing until then.

**Verification follows evaluation** because you cannot tell whether a verifier helps
without a way to measure. Order matters here more than anywhere else in the plan.

**Guardrails precede everything with consequences.** Code execution (v1.4) and TDD
generation (v1.8) both run untrusted work; neither ships before the approval boundary
exists.

## Gated

Built the day the trigger fires. Reviewed at every release boundary — record the trigger
firing, or record _"still not triggered"_. Never leave a gate to silence.

| #   | Pattern                      | Trigger                                                                                    |
| --- | ---------------------------- | ------------------------------------------------------------------------------------------ |
| 11  | Chain-of-Agents Orchestrator | v0.7 evaluation shows a routed pipeline beats one agent with tools on a real task          |
| 29  | Collective Intelligence      | Same instrument, same bar — debate or weighted voting measurably wins                      |
| 15  | Self-Improving               | A working regression harness exists, so policy changes can be measured rather than trusted |
| 16  | Conversational               | The product acquires a conversational surface                                              |
| 19  | Vision-Language              | The product must read screenshots, diagrams or scanned layout                              |
| 20  | Audio Processing             | A named requirement for speech input                                                       |

## Not building

Eight agents from the catalogue, each with a reason on the record in
[PATTERNS.md](PATTERNS.md): General Problem Solver, Recommendation, IoT, Embodied,
Healthcare, Financial, Legal, Education.

The four domain specialists are skipped because they are compositions of patterns above,
not new architectures. PATTERNS.md carries the decomposition that has to hold for that
claim to survive.

## Pace

v0.1–v0.5 shipped in nine days — roughly one release every two days — with no users, no
auth, no deploys and no support.

With a real product, expect releases to take several times longer. Most of that increase
is production engineering that belongs in the curriculum rather than overhead: auth,
deployment, data lifecycle, incidents, cost. The throughput transfers. The calendar does
not.
