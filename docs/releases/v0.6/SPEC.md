# v0.6 — Memory Architecture

Status: Planned. V0.6-000 planning is complete; V0.6-001 has not started.
Latest stable: [v0.5 — Retrieval Engineering](../v0.5/RELEASE.md), formally released.

## Goal

Design and incrementally implement explicit memory capabilities with deterministic
contracts and in-memory behavior before considering persistence. Teach what may be
remembered, selected, retrieved, updated, forgotten or excluded, and why each policy
belongs in an explicit capability rather than a generic state store.

This specification plans the release. It implements no memory behavior, selects no
storage engine and does not claim that any v0.6 milestone has shipped. The canonical
study guide remains the v0.5 edition until formal v0.6 closure.

## Taxonomy and intended uses

These are the Laboratory's design categories, not a claim of human-like cognition.

| Category          | Meaning and useful case                                                                                             | Boundary                                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Working memory    | Temporary selected information useful for the current task, such as intermediate facts needed for the next decision | Explicit task lifetime; not the full observation history or an automatically retained long-term record         |
| Episodic memory   | Records of particular experiences/events and their outcomes, useful when recalling what happened in a prior episode | Keep event context distinct from generalized assertions; recording an event does not prove its account is true |
| Semantic memory   | Reusable assertions or knowledge considered across tasks, useful when consulting a previously retained fact         | Distinct from event history and from semantic/vector retrieval; assertions may be stale or wrong               |
| Procedural memory | Reusable guidance about how to perform a task, useful for recalling an established procedure                        | Guidance is data, not executable handlers, tool permission or authority to override application instructions   |

Teach all four categories. Runtime foundations begin with working, episodic and
semantic memory. Procedural-memory execution, automatic learned procedures and
self-modifying instructions are not required; do not invent a procedure engine to
complete taxonomy. Long-term describes intended use across task lifetimes, not a
durability guarantee: an in-memory foundation is lost when its process ends.

## Architecture and preserved boundaries

```text
Explicit application caller
  -> memory contracts and admission/lifecycle policy
  -> in-memory records
  -> explicit selection/retrieval policy
  -> selected data projected for the consumer
```

This is a responsibility diagram, not a commitment to class names or a framework.
A selected memory may later inform application/model context through an explicit
integration boundary. It must not automatically become a tool observation, a
checkpoint, a corpus chunk or trusted instructions.

Preserve released v0.1-v0.5 contracts and behavior:

- AgentState remains goal plus ordered tool observations, not a memory database.
  Success observations still originate from validated ToolExecutor outcomes.
- Checkpoints retain logical execution state, consumed budgets and deadline
  semantics. Memory reads/writes do not resume execution, reset budgets, replay
  pending tools or imply durability. Intentional pause retains its own time policy.
- Retrieval corpora remain explicitly supplied documents/chunks with retriever-owned
  score semantics. Reusing an algorithm later does not merge corpus and memory
  lifecycles or require embeddings for memory selection.
- Context is selected input for a particular model call. Context assembly and
  application prompt ownership remain separate from storage and retention.
- ModelProvider remains generation-only; EmbeddingProvider remains embedding-only.
  Neither gains an implicit memory side effect. No live provider is required here.
- ToolExecutor/ToolRegistry retain controlled invocation and permission authority.
  Any later model-requested memory action must respect that boundary; memory cannot
  confer grants or expose handlers, clients, signals or credentials to model state.

Do not collapse AgentState, Checkpoint, Retrieval corpus, Context and Memory into
one generic store. Do not alter released invariants to make integration convenient.
See ADR-007/008 for agents, ADR-009 through ADR-012 for orchestration, and ADR-013
through ADR-016 for retrieval and generation. The
[v0.5 review](../v0.5/REVIEW.md) records the current evidence limits.

## Required distinctions

- Working memory != long-term memory: temporary task use and cross-task retention
  require different lifetimes, even if both initially use process memory.
- Checkpoint != memory: continuation data does not establish learned knowledge.
- Retrieval corpus != memory: searchable source material is not automatically an
  admitted experience or retained assertion.
- Conversation context != persistent memory: inclusion in a model call does not
  retain data beyond that call or provide persistence.
- Semantic memory != episodic memory: an assertion and an event account have
  different meanings; neither implies embeddings or factual correctness.
- Memory storage != memory selection policy: keeping a record does not decide
  when it should influence a task.
- Memory retrieval != automatic trust: selected records can be irrelevant, stale,
  incorrect or malicious; selection is not truth, permission or instruction priority.

## Policy work before infrastructure

Each implementation task must define and test the applicable decisions before
adding behavior. Use existing Zod/schema conventions and safe local errors where
appropriate; keep record data runtime-object-free.

1. Admission/exclusion: define eligible information, its origin and scope. No
   automatic retention of full prompts, transcripts, logs or raw tool/provider
   payloads. Exclude credentials, tokens, permission grants and runtime objects;
   do not claim that JSON/schema validation can detect every secret in text.
2. Identity/category/lifetime: define which record is being addressed, where it
   belongs and when it ceases to be useful. Keep category isolation explicit.
3. Selection/retrieval: define deterministic eligibility, order, limits, empty
   results and irrelevant-memory exclusion before selecting scoring machinery.
4. Updates: define replace/merge/conflict and missing-record behavior rather than
   silently turning an event into a fact or overwriting history by accident.
5. Forgetting: define what removal means for retained records and future selection.
   Do not claim deletion from previously returned copies, model requests or a
   durable backup when no such guarantee is implemented.
6. Integration: define the consumer projection, explicit write/read triggers and
   absence behavior. Existing agent behavior must remain unchanged when unused.

Concrete fields, ID conventions, capacities, clocks, update algorithms and selection
rules are not preselected by this planning task. Resolve L1/L2 choices autonomously
under [DECISION_POLICY](../../DECISION_POLICY.md); record meaningful L2 architecture
in an ADR when selected. Escalate L3 consequences, not ambiguity alone. Any identity,
authentication, persistent-storage or released-invariant redesign requires explicit
L3 authorization; this plan does not provide it.

## Planned milestones and completion evidence

Only the current milestone is implementation scope. All milestones below are planned.

| Task                                                       | Objective and required outcome                                                                                                                     | Evidence / exit criteria                                                                                                                                                                                    |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V0.6-001 — Memory domain contracts and taxonomy            | Define minimal provider-neutral runtime contracts and explain all four categories; clarify record identity, category and data/exclusion boundaries | Deterministic valid/invalid contract tests and taxonomy examples; no storage, selection, model calls or agent integration                                                                                   |
| V0.6-002 — Working-memory boundary                         | Establish explicit temporary task-scoped in-memory behavior without duplicating AgentState or changing checkpoints                                 | Tests of independent scopes, lifetime/reset behavior, owned data and invalid input under a documented bounded policy                                                                                        |
| V0.6-003 — Episodic and semantic memory foundations        | Add explicit in-memory record behavior for experiences and assertions, maintaining their distinct meaning and origin                               | Tests of category separation, explicit admission/read behavior and process-lifetime limits; no automatic inference or consolidation                                                                         |
| V0.6-004 — Memory selection, update and forgetting policy  | Define the smallest deterministic policies for selecting eligible data, updating records and forgetting it                                         | Exact tests for ordering/limits, conflicts or missing records, irrelevant exclusion and removal from future selection; document limits of deletion                                                          |
| V0.6-005 — Memory retrieval and agent integration boundary | Provide minimal explicit application composition so selected memory can inform decisions without becoming observations or execution authority      | Fake-provider integration tests preserving ModelProvider, ToolExecutor, AgentState, checkpoint and budget invariants; unused-memory path preserves existing behavior                                        |
| V0.6-006 — Memory evaluation foundations                   | Add reusable deterministic labeled scenarios for memory lifecycle and selection                                                                    | Exact selection/retrieval, category isolation, update, forgetting and irrelevant-memory assertions; no live quality or universal accuracy claims                                                            |
| V0.6-007 — Memory system review and mastery                | Review implemented boundaries, unnecessary complexity, evidence and limitations                                                                    | REVIEW and MASTERY with source-linked trace exercises; correct only clear defects; review alone does not declare release                                                                                    |
| V0.6-008 — Release closure and study-guide synchronization | Formally close v0.6 in the repository after required work passes; record delivered scope and synchronize curriculum/project status                 | RELEASE, updated study guide/changelog, release/test snapshots, mastery distinctions, README/BLUEPRINT/CURRENT status and passing pnpm verify; no deployment/tag/publication or next-release implementation |

V0.6-008 is part of this release plan from the beginning; it does not need a new
ad-hoc closure milestone after review. Execute it only when it becomes the active
task and prerequisite work is complete. Do not silently add procedural execution,
persistence or broader capabilities to satisfy a directional milestone.

## Evaluation direction

Measure deterministic memory behavior separately from model reasoning or factual
correctness. Use controlled fixtures and fake providers only where integration
requires them. Expected records and exclusions should make correct selection and
retrieval, category isolation, update/forgetting semantics and irrelevant-memory
avoidance observable. Assert exact outcomes and order where policy defines them.
Do not select aggregate thresholds or build a full evaluation framework in V0.6-000.

Passing fixtures will not prove real-world memory usefulness, truth, safe retention
of arbitrary sensitive data, cross-process durability or better model reasoning.
Live model quality, probabilistic judges and statistical benchmarks require separate
justification; no live calls are required by this plan.

## Non-goals

Unless a later task explicitly earns and authorizes them, exclude persistent database
infrastructure, Redis, vector databases, a distributed memory service, LangGraph
memory abstractions, long-running durable workflows, queues/workers, browser
automation, MCP, multi-agent shared memory, Python services, frontend and production
deployment. No new external memory framework or paid/network runtime dependency is
assumed. Automatic model-derived memories, embedding integration, learned procedure
execution and background consolidation are not required to demonstrate this release.

## Validation and release exit

Run `pnpm verify` for each completed milestone; preserve existing deterministic
regressions. Report actual checks, test counts and any separate evidence honestly.
Tests and documentation are part of implementation. At release closure, distinguish
implemented scope from deferred items and future roadmap, synchronize the study
guide only then, and do not assert learner mastery from passing tests.

V0.6-000 is documentation/planning only: create this SPEC, update current project
status, validate the repository and stop before V0.6-001. No memory code is added.
