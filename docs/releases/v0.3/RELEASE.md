# v0.3 — Custom Agent Loop

Status: Released (2026-09-13).

V0.3-007 closes this release and establishes v0.4 planning only. This is a repository
release record, not a deployment or a claim of live model reasoning quality.

## Goal and delivered architecture

Build the smallest explicit bounded decision/action loop before introducing an
orchestration framework. Probabilistic decisions propose actions; deterministic
software controls validation, permission, ordering and termination.

```text
AgentRunner -> AgentDecisionService (single-step decision service) -> ModelProvider
AgentRunner -> ToolExecutor -> ToolRegistry -> controlled handler
```

| Milestone | Delivered                                                                        |
| --------- | -------------------------------------------------------------------------------- |
| V0.3-001  | Provider-neutral AgentState, AgentDecision and ToolObservation runtime contracts |
| V0.3-002  | Single-step decision generation and explicit model-transport translation         |
| V0.3-003  | Bounded AgentRunner with safe observations, failures and cancellation            |
| V0.3-004  | Correlated, safe terminal agent diagnostics                                      |
| V0.3-005  | Reusable deterministic trajectory evaluation                                     |
| V0.3-006  | Architecture review and implementation-linked mastery exercises                  |

AgentState contains a non-empty goal and ordered tool observations. AgentDecision
is finish with trimmed non-empty result text, or tool_call with a non-empty tool
name and JSON-compatible object arguments. Model transport uses a root object
wrapper with argumentsJson, decoded and canonically validated after ModelProvider
returns. AgentDecisionSchema is not itself a directly supported OpenAI response
schema. The single-step service is named AgentDecisionService in code; it imports
no SDK and receives only handler-free tool descriptions.

Only ToolExecutor executes actions. It enforces grants and selected-tool input/output
schemas. Successful observations use its validated result and additionally require
JSON compatibility; failures contain safe ToolExecutionError codes, never raw errors.
Grants, handlers and signals remain outside model-visible state.

## Control and diagnostics

AgentRunner defaults to six iterations and a single 60000 ms whole-run deadline,
configurable at construction. Each iteration makes one decision and at most one
executor call. Finish terminates immediately. Exhaustion yields LOOP_LIMIT without
an extra model call. Safe tool failures permit another decision within the remaining
budget; no automatic agent/tool retry or policy change is introduced.

Optional caller AbortSignal and the deadline stop waiting and later stages. Safe
AgentRunError codes are INVALID_INPUT, DECISION_FAILED, INVALID_DECISION, LOOP_LIMIT,
TIMEOUT, CANCELLED and INTERNAL. No raw causes or partial-state error payloads are
exposed. Existing provider reliability and tool deadlines remain unchanged.

One terminal agent_run event records requestId when available, started decision and
executor counts, duration, outcome and safe failure code. Payloads and grants are
excluded; logger failure cannot replace the run outcome. See
[ADR-007](../../adr/ADR-007-agent-domain-contracts.md) and
[ADR-008](../../adr/ADR-008-bounded-agent-loop.md).

## Verification and learning

All 274 automated tests in 15 suites passed at release transition. Formatting,
format:check, lint, typecheck, build and git diff --check passed. HTTP regression
tests used localhost sockets. No live OpenAI request was required or made.

Six trajectory scenarios use a fake ModelProvider and real decision service,
runner, executor and registry: immediate finish, successful addition, permission
denial, invalid tool input, loop exhaustion and translation failure. Exact outcomes,
calls, observations and decision counts must match. Existing tests cover additional
schema, cancellation, deadline, privacy and reliability paths.

[REVIEW.md](REVIEW.md) found no clear architecture violation requiring production
correction. [MASTERY.md](MASTERY.md) provides trace exercises and questions; it does
not claim that the learner has completed them. Deterministic evaluations prove
system/trajectory correctness for scripted fixtures, not live model quality.

## Known limits and deliberately deferred capabilities

- Cancellation is cooperative. Underlying provider/tool work may continue after
  the runner stops waiting; synchronous work cannot be preempted.
- Logs are best-effort diagnostics, not durable audit storage. Request IDs do not
  uniquely identify runs.
- No agent HTTP endpoint, durable checkpointing or persistence is delivered.
- No LangGraph, RAG, long-term memory or multi-agent behavior is present.
- No live model reasoning-quality benchmark is claimed. Live quality, repeated-run
  reliability, statistics, model comparisons and cost/latency benchmarking are deferred.
- Trusted acyclic initial state, registration and schemas are not a hostile-code
  sandbox. JSON compatibility does not redact secrets or prove observation provenance.
- Finish does not prove goal completion. Duplicate actions and unbounded payload
  sizes remain possible; no rollback or exactly-once effects are promised.

Active development moves to [v0.4 — Stateful Agent Orchestration](../v0.4/SPEC.md).
V0.4-001 is planned only; this transition adds no application implementation.
