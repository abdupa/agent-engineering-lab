# Bounded custom agent loop

[AgentRunner](../../apps/api/src/agent/agent-runner.ts) coordinates one-step decisions
and controlled tool execution. Its run method accepts initial AgentState, tool
name/description records, and optional { permissions, signal }. Constructor options
set maxIterations (default 6) and timeoutMs (default 60000). A successful finish
returns { result, state }; failures reject with safe AgentRunError codes.

```text
copy initial state -> decision service -> validate canonical decision
  finish -> return result and state
  tool_call -> ToolExecutor -> validated result or safe tool failure
    -> validate/append observation -> next decision within remaining budget
exhaustion / deadline / cancellation / agent failure -> safe rejection
```

Each iteration permits one decision and at most one tool invocation. The final
iteration may finish, or may perform a tool call and then exhaust the limit. There
is no extra decision to force an answer. Safe tool failures are observations, not
agent failures; an unexpected executor exception terminates instead. ToolExecutor
still checks grants, arguments, output, and its own timeout. No raw handler can be
invoked by the runner.

State is copied at entry; decision inputs are snapshots. Observations retain the
requested call, and success data comes from the validated executor result, not raw
handler output. The observation schema additionally requires JSON compatibility.
Permissions are copied separately and never included in model-facing state. Tool
metadata is explicitly projected to name/description.

A single deadline covers the whole run, including transport translation and
observation validation. A caller AbortSignal may stop the run. Stage checks reject
late results before starting more work; listeners and timers are removed after
settlement. Cancellation is not forwarded through interfaces that do not accept it.
An existing model/tool operation can continue after the runner returns TIMEOUT or
CANCELLED; tool cooperative abort and provider policies remain unchanged. JavaScript
cannot preempt synchronous work. These limits are not remote cancellation or
exactly-once guarantees.

| Failure          | Meaning                                                 |
| ---------------- | ------------------------------------------------------- |
| INVALID_INPUT    | Initial run input cannot be prepared                    |
| DECISION_FAILED  | Provider/decision translation failed                    |
| INVALID_DECISION | Returned canonical decision fails runtime validation    |
| LOOP_LIMIT       | Iterations exhausted without finish                     |
| TIMEOUT          | Whole-run deadline expired                              |
| CANCELLED        | Caller aborted the run                                  |
| INTERNAL         | Unexpected executor failure or invalid observation data |

No raw causes or payloads are retained in errors. [Run failure diagnostics](agent-run-observability.md) are implemented in V0.3-004. See [ADR-008](../adr/ADR-008-bounded-agent-loop.md).

Deterministic tests cover finish, exact limits, safe failure continuation, no forced
answer, invalid decisions, deadline accumulation, cancellation and late-work
suppression, configuration validation, cleanup, and real translator/executor
composition using a fake provider. A finish response is not evaluated for semantic
quality here. There is no HTTP endpoint, startup integration, retry, deduplication,
planning state, persistence, or autonomous high-risk tool added.

The key concept is explicit bounded control flow: probabilistic decisions propose
one action, while deterministic software enforces execution order and budgets.
