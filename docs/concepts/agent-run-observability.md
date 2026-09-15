# Agent failure handling and observability

V0.3-004 adds one final agent_run event to AgentRunner, reusing Nest Logger and
request correlation. It records invocation-local counters and caller-visible run
settlement, not the reasoning content or every loop transition.

| Field      | Meaning                                                                  |
| ---------- | ------------------------------------------------------------------------ |
| event      | agent_run                                                                |
| requestId  | Captured from existing request context at entry; omitted outside context |
| iterations | Decision calls started in this run, including a pending or failed call   |
| toolCalls  | ToolExecutor calls started, including denied/failed/pending calls        |
| durationMs | Monotonic elapsed time through settlement, excluding log delivery        |
| outcome    | success for finish; failure for terminal agent error                     |
| code       | Failure only: existing safe AgentRunError code                           |

Zero decisions are possible for invalid initial input or pre-cancellation. Counts
exclude initial-state observations and do not count SDK retries as iterations.
A safe tool failure can be followed by a finish: the run then logs success, while
the existing tool event and state observation retain the tool failure. No run-level
failure is invented for a recoverable tool result.

AgentRunError codes remain INVALID_INPUT, DECISION_FAILED, INVALID_DECISION,
LOOP_LIMIT, TIMEOUT, CANCELLED, and INTERNAL. Deadline/cancellation precedence is
preserved before recording the normalized terminal error. No new retry, continuation,
provider, or tool policy is introduced. Provider details and malformed transport
JSON become safe decision failures through the existing runner boundary.

Logs contain no goals, state, observations, instructions, descriptions, tool names,
arguments, model results, permission lists, signals, raw errors, causes, or abort
reasons. Existing provider/tool logs carry their own safe metadata. No run identifier
or new context is passed through application contracts.

Cleanup occurs before logging. Logger exceptions do not replace a result or failure.
Late model/tool work after stopping cannot emit another runner summary; underlying
provider/tool logs may still arrive. Request IDs may be reused and do not uniquely
identify multiple runs within one request. No durable audit store, start/step events,
distributed tracing, or delivery guarantees are claimed. Console I/O may add latency,
and process termination can lose completion records. Direct service or handler calls
outside AgentRunner do not create a run summary.

Tests verify exact fields, all terminal codes, tool-failure continuation, concurrency,
missing context, privacy, late decisions after timeout/cancellation, and logger
failure. Existing budget and cancellation tests remain regression evidence.

The key concept is observing a failure boundary without changing its policy: one
final summary describes the run result while lower-level failures retain their
existing meaning. See [ADR-008](../adr/ADR-008-bounded-agent-loop.md).
