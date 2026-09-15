# Agent state and decision contracts

V0.3-001 adds runtime schemas and inferred TypeScript types in
[agent.schema.ts](../../apps/api/src/agent/agent.schema.ts). These describe internal
agent data, not a model request format or an executable loop.

| Contract            | Fields                                                                            |
| ------------------- | --------------------------------------------------------------------------------- |
| finish decision     | type: finish; result: trimmed non-empty string                                    |
| tool_call decision  | type: tool_call; toolName: trimmed non-empty string; arguments: JSON object       |
| success observation | status: success; call: requested tool_call; result: JSON value                    |
| failure observation | status: failure; call: requested tool_call; code: existing ToolExecutionErrorCode |
| state               | goal: trimmed non-empty string; observations: ordered array                       |

Arguments must be objects, including empty objects, with recursive JSON values.
Successful results can be any JSON value: object, array, finite number, string,
boolean, or null. JSON strings are ordinary data, not an alternative encoding for
the arguments object. Unknown envelope fields are stripped. Data inside argument
and result objects is retained and must be handled according to the calling
application's privacy rules; these schemas are not general-purpose redactors.

The requested call is recorded rather than reconstructing it from a transformed
handler input. Successful observation data must come from ToolExecutor after its
output validation, followed by the observation's JSON compatibility check. The
schema alone cannot establish where a result came from. That future ordering is
required but no invocation or observation-construction service is implemented here.
Failures carry only the safe code, never raw exceptions or error causes. Handler
references, permission grants, signals, provider metadata, and log data have no
fields in the state/observation envelopes.

The six permitted codes are NOT_FOUND, DENIED, INVALID_INPUT, EXECUTION_FAILED,
INVALID_OUTPUT, and TIMEOUT. A compile-time exhaustive mapping keeps the runtime
schema aligned with the existing tool error contract without changing that layer.

## Domain versus transport

The installed OpenAI strict schema helper rejects a top-level union and arbitrary
object maps. An object wrapper solves the first problem only. AgentDecisionSchema
must not be assumed directly usable with OpenAI Structured Outputs. See
[ADR-007](../adr/ADR-007-agent-domain-contracts.md) for the offline evidence.

V0.3-002 must compare a model-facing wrapper with decoded JSON-text arguments
against deriving nested tool-specific structured schemas from registered input
schemas. V0.3-002 selected the [JSON-text transport adapter](single-step-agent-decision.md).
Any future alternative must yield the
same provider-neutral domain decision and preserve ToolExecutor validation/policy.

## Learning and tests

The engineering concept is separating a domain contract from transport constraints:
internal structured arguments remain objects even when a provider cannot describe
an arbitrary map in its strict wire schema. Runtime validation complements inferred
types without introducing a model service or agent loop.

Tests cover decision branches, JSON nesting, invalid arguments/results, safe error
codes, trimming, ordered/empty observations, and stripping unrelated envelope data.
Schemas do not verify goal completion, tool existence, permission, provenance,
acyclic hostile inputs, or semantic correctness. Loop limits, execution, continuation
policy, memory, and model calls remain deferred.
