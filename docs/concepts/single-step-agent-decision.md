# Single-step agent decision

[AgentDecisionService](../../apps/api/src/agent/agent-decision.service.ts) accepts
AgentState and handler-free tool descriptions and returns one canonical AgentDecision.
It does not execute the decision or update state.

```text
state + tool name/description records
  -> runtime envelope validation and projection
  -> ModelProvider.generateStructured (one request)
  -> validated model-facing wrapper
  -> decode argumentsJson for tool_call
  -> AgentDecisionSchema validation
  -> canonical decision
```

The transport format has an object root with a decision field. Its nested variants
are finish with result, or tool_call with toolName and argumentsJson. Only this
model-facing representation uses JSON text. The translator requires the decoded
arguments to be a JSON-compatible object and returns the canonical object-valued
contract. Malformed JSON and invalid canonical data yield the fixed message
Agent decision translation failed, without raw parse errors or causes.

ModelProvider owns validation of the transport schema; final domain validation
checks a different boundary after decoding. Neither parsing nor domain validation
checks tool-specific argument rules. A decision with incorrect argument types for
a particular tool can therefore be returned; ToolExecutor must reject it when
execution is introduced. Tool existence and grants are not enforced by this service.

The service accepts only name and description fields for tool guidance. Callers
must provide descriptions that explain expected arguments and must not pass raw
handlers. Runtime projection strips extra fields as defense in depth; it is not
permission to give the agent a registry. State envelope projection excludes
infrastructure fields, but ordinary JSON within observations remains data and can
contain sensitive text. Callers remain responsible for safe model-facing data.

Instructions are fixed and kept separate from serialized state/descriptions. This
separation is not proof of prompt-injection immunity. Unknown/invalid state or tool
description envelopes fail before generation with Agent decision input is invalid.
Provider failures propagate unchanged. No raw errors are logged by this service.

## Compatibility and limits

The actual transport schema converts using the installed zodTextFormat helper in
a deterministic test. Earlier comparison confirmed fixed tool-specific nested
schemas also convert, while open maps/transformed schemas can fail. See
[ADR-007](../adr/ADR-007-agent-domain-contracts.md) for the authorized choice.
This is offline compatibility evidence, not a live model-quality result.

No OpenAI SDK is imported by production agent code. There is no tool invocation,
loop, budget, retry, permission change, endpoint, or startup integration. The service
uses the existing provider contract and policy. Provider-native tool calling remains
a possible later architecture, not an implemented ModelProvider extension.

The key concept is an explicit transport-to-domain adapter: a constrained wire
representation can be decoded and validated without changing the domain model.
