# Tool observability and auditability

V0.2-004 adds one best-effort tool_execution summary for each ToolExecutor.execute
call, using the existing Nest Logger and request AsyncLocalStorage from ADR-004.
No logging or correlation parameters are added to Tool or its execution context.

| Field      | Meaning                                                                             |
| ---------- | ----------------------------------------------------------------------------------- |
| event      | tool_execution                                                                      |
| requestId  | Captured at invocation when request context exists; otherwise omitted               |
| tool       | Bounded safe registered name, [invalid-tool-name], or [unregistered]                |
| durationMs | Monotonic elapsed time from invocation through settlement                           |
| outcome    | success after output validation, or failure                                         |
| code       | Failure only: existing ToolExecutionError code, or INTERNAL for an unexpected error |

A registered name is logged only if it contains 1–128 ASCII letters, digits,
periods, underscores, colons, or hyphens and is not sk-prefixed. Other registered
names remain executable but get a fixed marker in logs. Unknown requested names
are never logged, even when syntactically simple. Names are diagnostic metadata
and must not contain secrets; a character allowlist cannot identify every secret.

Records contain no input, output, schemas, descriptions, required/granted permission
lists, credentials, raw errors, or causes. Denial is visible through DENIED without
disclosing permission names. The existing application bootstrap renders Nest logs
as JSON; standalone consumers use their configured Nest logger.

The summary is emitted when the executor settles, including validation rejection,
policy denial, unknown lookup, handler failure, and timeout. It is not evidence
that an ignored abort stopped the underlying handler. Late completion after timeout
does not produce a second summary. Requests may share IDs, so these are local
correlated records, not unique distributed execution identities.

Logging errors are caught so they cannot replace a successful result or normalized
failure. Timer cleanup precedes logging. Duration excludes log delivery; console
I/O can still add ordinary overhead. A stalled operation produces no completion
record until it settles or its cooperative deadline can run. Process termination
can lose records entirely.

This supplies diagnostic audit evidence, not durable, tamper-evident audit storage,
proof of authorization identity, distributed tracing, or exactly-once execution.
Direct handler calls bypass executor logs. No log sink, database, queue, telemetry
dependency, start event, or new application endpoint is introduced.

Tests verify exact field sets, every normalized failure, successful output validation,
privacy, unsafe/unknown names, concurrent correlation, missing context, late work
after timeout, and preservation of results when logging fails. Existing reliability
and policy tests remain unchanged in behavior.
