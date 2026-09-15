# ADR-007 — Agent domain contracts separate from model transport

Status: Accepted

Date: 2026-09-13

## Context

V0.3-001 defines explicit state and runtime decisions without implementing model
calls, tool invocation, or a loop. The user authorized a provider-neutral contract
rather than changing structured arguments to strings to satisfy one transport.

## Decision

AgentDecisionSchema is a discriminated union on type: finish carries trimmed,
non-empty result text; tool_call carries a trimmed, non-empty toolName and a
JSON-compatible object in arguments. AgentStateSchema contains a trimmed non-empty
goal and an ordered observations array, including the empty initial array.

ToolObservationSchema records the requested ToolCall and either status success
with a JSON-compatible result or status failure with an existing safe ToolExecutor
code. Types are inferred from Zod schemas. The runtime error-code mapping is checked
for exhaustiveness against ToolExecutionErrorCode without modifying the tool layer.
No research types, provider SDK types, handlers, grants, signals, or log envelopes
are part of these contracts. Unknown envelope properties are stripped, following
existing schema conventions; arbitrary argument/result object keys are retained.

Success observations must be constructed from data returned after ToolExecutor's
output validation. The observation schema additionally checks JSON compatibility;
it cannot prove data provenance or validate against a particular tool's output
schema. Future execution code must enforce this ordering. No helper that invokes
a tool or manufactures observations from raw handler output is introduced here.

## Installed transport compatibility finding

Offline checks against the installed zodTextFormat path established:

- Strict OpenAI Structured Outputs requires an object at the root. A top-level
  discriminated union produces a root union/anyOf rather than the required object
  and is rejected by the helper.
- Wrapping the union in an object resolves the root issue, but not arbitrary maps.
  z.record and the object branch of z.json require open additionalProperties;
  the strict helper rejects them because object schemas require
  additionalProperties: false.
- A wrapped decision using fixed object argument fields converted successfully.
  This is offline conversion evidence, not live model acceptance.

AgentDecisionSchema is an internal domain schema and is **not necessarily usable
as a schema passed directly to OpenAI Structured Outputs**. The domain is not
contorted to meet provider transport limitations. ModelProvider remains unchanged.

V0.3-002 must evaluate the smallest translation approach: (1) an OpenAI-compatible
wrapper with JSON-text arguments decoded and domain-validated before ToolExecutor
validation, or (2) a nested tool-specific structured schema derived from registered
input schemas if the architecture and SDK support it without undue complexity.
Neither strategy is selected or implemented in V0.3-001. JSON text is not the
canonical AgentDecision representation. Agent code must remain dependent on
ModelProvider, not OpenAI SDK internals.

## Consequences and limits

The domain and transport can evolve independently, at the cost of a future explicit
translation boundary. JSON-compatible values exclude functions, undefined, bigints,
non-finite numbers, and runtime objects such as Error/AbortSignal. Inputs are
expected to be acyclic JSON data; recursive Zod validation is not a cycle-detection
or hostile-object sandbox. JSON compatibility does not redact secrets embedded in
ordinary strings or prove result quality.

Counters, budgets, deadlines, failure continuation, planning state, memory,
permissions, execution behavior, provider calls, and tool invocation remain outside
this milestone. No new dependency or framework is required.

## V0.3-002 — Authorized transport adapter

AgentDecisionService now requests one decision through ModelProvider using a root
object wrapper. The nested finish variant carries result text; tool_call carries
toolName and argumentsJson. The translator parses argumentsJson and validates the
canonical value with AgentDecisionSchema, rejecting malformed JSON, non-object
arguments, and non-JSON values with a fixed safe translation error. Canonical
arguments remain objects. No tool-specific validation or invocation occurs here.

Offline comparison found both JSON-text transport and fixed addition-tool schemas
convert with the installed strict helper. Arbitrary maps and transformed schemas
do not. The authorized JSON-text transport keeps a single small adapter without
restricting the domain/tool contract to directly representable schemas. Its cost is
that Structured Outputs constrains the argument string, not its decoded contents;
ToolExecutor remains responsible for the selected tool's input schema and policy.

The service depends only on ModelProvider, Zod, and agent contracts. It receives
handler-free name/description records, not a registry or executor. Parsed projection
strips extra envelope fields before serialization. Descriptions must explain the
expected arguments; no executable schema or handler is passed to the model. State,
observations, and descriptions remain data separate from fixed instructions.

Provider failures propagate unchanged without retries. Local input/translation
failures use fixed Error messages without raw causes. Detailed agent failure policy
remains a later milestone. No Nest module or HTTP wiring is needed without a
consumer. The transport schema is checked using the SDK only in deterministic tests;
production agent code imports no OpenAI SDK.

Provider-native function/tool calling is a possible future alternative, not an
extension to ModelProvider in this task. It requires a later explicit requirement.
No loop, tool execution, grant handling, or new provider capability is introduced.
