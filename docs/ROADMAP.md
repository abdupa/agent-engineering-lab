# Roadmap

Ten patterns to build, six gated on evidence. Each release earns its place by naming a
product requirement before any code is written — see [CLAUDE.md](../CLAUDE.md).

A roadmap entry is not authorization. [CURRENT.md](CURRENT.md) names what is active.

## Carried forward — already built

| Release | Delivered | Patterns |
| --- | --- | --- |
| v0.1 | Provider boundary, structured output, runtime validation, reliability, observability | foundation |
| v0.2 | Tool contracts, registry, permissioned executor, deadlines, cancellation | #10 Tool-Using |
| v0.3 | Bounded agent loop, decision contracts, trajectory evaluation | #1 Autonomous Decision-Making |
| v0.4 | Orchestration state machine, checkpoint / restore / resume, intentional pause | foundation for #12 |
| v0.5 | Chunking, lexical + semantic retrieval, context assembly, grounded generation, retrieval evaluation | #4 Knowledge Retrieval (partial) |

468 tests across 25 suites. 16 ADRs. See [docs/releases/](releases/).

## Scheduled

| # | Release | Pattern | The requirement that earns it |
| --- | --- | --- | --- |
| 1 | **v0.6 — Memory** | #3 Memory-Augmented | A user returning next week gets an agent that already knows their constraints. |
| 2 | **v0.7 — Planning** | #2 Planning | Work needs more than one tool call, and a bad plan wastes the user's time and your money. |
| 3 | **v0.8 — Async execution** | #12 (part 1) | A job runs for minutes. Submit and be notified; no held connection. |
| 4 | **v0.9 — Guardrails & HITL** | #12 (part 2), #23 folded in | The agent does something with consequences. High-risk actions require a human. |
| 5 | **v1.0 — Evaluation** | — | Quality regresses silently when you change a prompt or a model. Catch it before users do. |
| 6 | **v1.1 — Verification** | #8 Verification & Validation | An answer cites its evidence and is still wrong. Citation is not support. |
| 7 | **v1.2 — Document intelligence** | #5 Document Intelligence | The source material arrives as PDFs, not clean text. |
| 8 | **v1.3 — Code execution** | #7 Data Analysis | A question needs computation over data, not retrieval of prose. |
| 9 | **v1.4 — Compliance & policy-as-code** | #14 Compliance / Security | Output must satisfy a written policy before it is allowed to leave. |
| 10 | **v1.5 — Explainability** | #24 Explainable | A reviewer must audit why the agent concluded what it concluded. |
| 11 | **v1.6 — Operator console** | — | Someone must watch runs, approve the gates v0.9 created, and debug a failure. |
| 12 | **v1.7 — TDD code generation** | #13 Code-Generation | The agent writes code, and the only trustworthy correction signal is a failing test. |
| 13 | **v1.8 — Hybrid retrieval & provenance** | #4 (completion) | Semantic search misses exact terms, and a reader needs to know where a claim came from. |
| 14 | **v2.0 — Extraction** | — | Patterns that proved themselves in production become reusable deliberately, not by accident. |

### Ordering notes

**Evaluation (v1.0) sits deliberately early.** It is the instrument every later decision
depends on — whether verification helps, whether multi-agent wins, whether a change made
things worse. Building it late means guessing until then.

**Verification follows evaluation** because you cannot tell whether a verifier helps
without a way to measure. Order matters here more than anywhere else in the plan.

**Guardrails precede everything with consequences.** Code execution (v1.3) and TDD
generation (v1.7) both run untrusted work; neither ships before the approval boundary
exists.

## Gated

Built the day the trigger fires. Reviewed at every release boundary — record the trigger
firing, or record *"still not triggered"*. Never leave a gate to silence.

| # | Pattern | Trigger |
| --- | --- | --- |
| 11 | Chain-of-Agents Orchestrator | v1.0 evaluation shows a routed pipeline beats one agent with tools on a real task |
| 29 | Collective Intelligence | Same instrument, same bar — debate or weighted voting measurably wins |
| 15 | Self-Improving | A working regression harness exists, so policy changes can be measured rather than trusted |
| 16 | Conversational | The product acquires a conversational surface |
| 19 | Vision-Language | The product must read screenshots, diagrams or scanned layout |
| 20 | Audio Processing | A named requirement for speech input |

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
