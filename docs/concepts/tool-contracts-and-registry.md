# Tool contracts and registry

V0.2-001 separates describing/discovering a tool from controlling its execution.
A tool is a deterministic capability with a name, description, Zod input/output
schemas, and an async operation. It is not an agent, model-provider extension,
or an HTTP endpoint.

[tool.ts](../../apps/api/src/tools/tool.ts) defines Tool<Input, Output>. Its input
type describes parsed data, so a trimming/coercion schema can prepare raw input
before the executor invokes the handler. Output still needs runtime validation;
a Promise<Output> annotation is not proof of correctness for external data.

[ToolRegistry](../../apps/api/src/tools/tool-registry.ts) provides:

| Operation      | Behavior                                                                                          |
| -------------- | ------------------------------------------------------------------------------------------------- |
| register(tool) | Explicit registration; rejects invalid identity/description and duplicate names with fixed errors |
| get(name)      | Exact, case-sensitive lookup; undefined means absent                                              |
| list()         | Fresh array in registration order; no handler execution                                           |

Definitions are shallow snapshots and frozen. Later reassignment of the source
object's name or handler does not change registration. Schema objects and handler
closures are shared; registration expects trusted code, not arbitrary external
objects. Each registry owns its own Map and has no process-global state.

Different tools have different input types. Dynamic lookup cannot recover that type
from a string alone. RegisteredTool retains schema metadata but exposes the handler
with a never input, preventing unchecked invocation through discovery. Original
typed tool objects retain their typed handlers. This is a compile-time restriction,
not an authorization mechanism. ToolExecutor establishes the validated invocation
boundary; callers cannot bypass type erasure with a generic lookup cast.

The registry imports no SDK, research schema, Nest dependency, or observability
context. It is not wired into AppModule because no application consumer exists yet.
See [ADR-005](../adr/ADR-005-tool-contracts-and-registry.md) for the tradeoffs.

Tests use local fixture definitions with different schema types. They cover empty
and unknown lookup, schema metadata, duplicate rejection, invalid names/descriptions,
case-sensitive names, registration order, definition stability, instance isolation,
and compile-time handler restrictions. Registration/discovery never invokes a
handler. Fixtures are not production tool capabilities.

[Controlled execution](controlled-tool-execution.md) and a deterministic addition
example are implemented in V0.2-002. [Timeout/policy enforcement](controlled-tool-execution.md) is implemented in
V0.2-003; [execution logging](tool-observability.md) in V0.2-004.
LLM selection and agent loops remain outside this implementation.

The key engineering concept is separating a contract and discovery from effects:
registering a callable operation does not grant permission or establish that an
input is safe to execute. That distinction is visible in Tool versus ToolRegistry
and the absence of an execution method on the registry.

Tools now declare requiredPermissions explicitly. Registration copies and freezes
this array; discovery does not grant those permissions. Handler context adds grants
and an AbortSignal, while input/output schemas and dynamic discovery typing remain
unchanged. See ADR-006 for execution enforcement and trust limits.
