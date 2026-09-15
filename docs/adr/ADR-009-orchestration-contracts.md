# ADR-009 — Explicit logical orchestration contracts

Status: Accepted

## Decision

V0.4-001 adds a phase-discriminated OrchestrationState containing the existing
AgentState as agentState. awaiting_decision contains only that state;
awaiting_tool_result additionally contains one canonical pendingCall; completed
contains trimmed non-empty result; failed contains an existing AgentRunErrorCode.
Completed and failed are terminal. Strict control envelopes reject extra fields,
including contradictory phase data, rather than silently stripping them. Nested
agent schemas retain their existing parsing conventions.

A pure transitionOrchestration function accepts decision, observation or failure
events. Finish completes; tool_call stores the pending call; a matching observation
appends to ordered observations and returns to awaiting_decision. Both active
phases accept safe failure codes. Terminal states reject all events. Parsed copies
preserve caller inputs. Invalid data or transitions throw a fixed Error with message
Invalid orchestration transition and no raw cause, following existing local safe
error conventions without adding an error hierarchy.

Matching uses Node isDeepStrictEqual on parsed canonical calls: names and JSON
arguments must match, object key insertion order is irrelevant and array order is
significant. This is logical equality, not an execution identifier or replay guard.
Successful observations must originate after ToolExecutor validation; schemas cannot
prove that provenance. No handler, model call or executor invocation occurs here.

## Tradeoffs and limits

The union makes phase-specific data and legal transitions explicit without a graph
framework. Existing AgentState, ModelProvider, ToolExecutor and AgentRunner remain
unchanged. A small exhaustive failure-code mapping tracks the existing error union.
JSON-domain data is expected to be acyclic; validation is not a hostile-object
sandbox or secret redactor. No runtime services, errors, signals or grants belong
in control state. These are logical progress contracts only, not guarantees of
durability, crash recovery, resumability or exactly-once execution.

Budgets, deadlines, persistence, identifiers/versioning, interrupts and pause/resume
are deferred. Checkpoint and resume semantics are V0.4-002; LangGraph remains a later
evaluation decision. No storage choice or new dependency is required.
