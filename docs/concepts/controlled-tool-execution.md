# Controlled tool execution

V0.2-002 introduces [ToolExecutor](../../apps/api/src/tools/tool-executor.ts):

```text
name + unknown input + granted permissions -> registry lookup -> permission check -> input schema parse
  -> handler (once) -> output schema parse -> parsed unknown result
```

The input and output parsers use parseAsync. Parsed values, including transformations
and removal of unknown fields, cross each boundary; raw values are not returned in
place of parsed output. The executor is independent of HTTP, research, OpenAI, and
Nest wiring. Registration remains side-effect-free discovery.

Dynamic lookup erases the handler's input type. The executor locally asserts a
callable type only after parsing against the same registered definition's input
schema. Trusted typed registration pairs schema and handler. Callers cannot request
an arbitrary result type with execute<T>(); results remain unknown. See
[ADR-005](../adr/ADR-005-tool-contracts-and-registry.md) for this tradeoff.

| Failure stage           | Fixed rejection message       |
| ----------------------- | ----------------------------- |
| Missing name            | Tool is not registered        |
| Input parse/refinement  | Tool input validation failed  |
| Handler throw/rejection | Tool execution failed         |
| Output parse/refinement | Tool output validation failed |

Raw errors, validation issues, input, and output are not attached as causes or
logged. Handlers execute at most once. V0.2-003 adds requiredPermissions and
ToolPermissionContext grants; missing context or missing grants produces DENIED
before parsing/invocation. The executor supplies handlers a ToolExecutionContext
with a frozen grants snapshot and AbortSignal. This is a trusted-caller tool-policy
boundary, not authentication or a sandbox.

The configurable constructor timeout defaults to 5000 ms, covers policy/input
validation, handler execution, and output validation, and aborts on TIMEOUT. No
per-tool override or retries exist. Cancellation is cooperative: ignored signals
may leave work running after timeout, and synchronous work cannot be preempted.
Checks between stages prevent late validation from initiating handler work. Timers
are cleared on success/failure. No rollback is claimed.

ToolExecutionError exposes safe codes NOT_FOUND, DENIED, INVALID_INPUT,
EXECUTION_FAILED, INVALID_OUTPUT, and TIMEOUT, with fixed messages and no raw causes.
See [ADR-006](../adr/ADR-006-tool-reliability-and-policy.md). [Tool execution summaries](tool-observability.md) are implemented in V0.2-004.

## Deterministic example

[addNumbersTool](../../apps/api/src/tools/add-numbers.tool.ts) adds two finite
JavaScript numbers. Explicitly register it with a ToolRegistry and supply that
registry to ToolExecutor; execute('add-numbers', { left: 2, right: 3 }, { grantedPermissions: ['calculate'] }) resolves to 5. No startup registration or HTTP endpoint is introduced. Zod rejects numeric
strings and non-finite inputs and strips extra object keys. An overflowing sum
fails output validation. Normal floating-point precision limitations apply.

Tests exercise parsed input/output, async transformations, invalid input before
invocation, unknown tools, safe errors, rejected output, no retries, and the real
example through registry/executor. They require no network or model calls.

The engineering concept is validation at a trust boundary: types describe a
handler's contract, while runtime parsing establishes the values allowed across
it. Controlled here includes explicit permission checks and bounded validated invocation;
it does not establish caller identity or prevent direct handler calls.
