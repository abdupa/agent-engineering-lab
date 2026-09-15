# Decision policy

Classify missing decisions by **consequence**, not by how unclear they are. Apply within
the one active task. Tests and documentation are part of the feature.

## L1 — Implementation

Decide autonomously when the decision is local to the active task, low-risk, reversible,
deterministic, testable, and has no externally visible architectural, security or
persistence consequence.

Helper decomposition, internal naming, data structures, fixture design, local validation
detail, deterministic ordering and tie-breaking, error naming, small pure utilities.

Choose the smallest reasonable design. Implement, test, report at completion. Do not stop
for approval.

## L2 — Bounded architecture

Decide autonomously when **all** of these hold:

- Inside the active SPEC, preserving existing boundaries
- Reversible without destructive migration
- No external infrastructure, no security redesign, no paid or networked runtime dependency
- Alternatives are reasonably understood
- One option is clearly the smallest design that satisfies the requirement

A small internal interface, a bounded deterministic policy, responsibility placement
between existing layers, a provider-neutral abstraction, safe continuation semantics.

Record context, decision, alternatives, consequences and deferred work. Write an ADR when
it shapes future architecture; otherwise record it in the affected doc and the completion
report. Implement and continue without waiting.

## L3 — Governance

**Stop before implementing.** State the missing decision, recommend the smallest option,
explain the alternatives and tradeoffs, and wait.

- Authentication, authorization, security boundaries, credentials
- Persistent storage architecture; destructive or compatibility-sensitive migration
- Breaking public API changes; changes to released architectural invariants
- External runtime services, paid providers, queues, workers
- Distributed boundaries, durable workflows, distributed locking
- Replay or idempotency guarantees for real side effects
- Production deployment architecture; a new runtime, language or service boundary
- Major framework adoption, or a dependency with architectural coupling
- Irreversible data operations
- Anything contradicting the SPEC, CHARTER or ROADMAP

Existing explicit authorization stays valid — do not ask twice for the same decision.
Do not quietly amend this policy to avoid it.

**Expect L3 to fire often once there are real users.** That is the policy working, not
the policy obstructing.

## Uncertainty rule

Missing detail alone is not a reason to stop. Several reasonable low-risk implementations
is not a reason to stop. Escalate on consequence. Classify by actual effect, not by which
example a decision superficially resembles.

## Complexity rule

Prefer, in order:

- Deterministic before probabilistic
- Local and in-memory before persistent and distributed
- Explicit contracts before framework abstractions
- A small custom implementation before adopting a framework
- Measurement before optimization
- An existing dependency before a new one

A framework must solve an identified requirement better than the current design. Learning
a framework is not itself a requirement.
