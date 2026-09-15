# ADR-004 — Safe request correlation and structured observability

Status: Accepted

Date: 2026-09-12

## Context

V0.1-008 requires correlated HTTP and provider diagnostics while preserving the
V0.1-007 reliability behavior. Request IDs must not become research inputs or
parameters in the ModelProvider contract. SDK debug logs can expose payloads and
cannot serve as our observability boundary.

## Decision

Use Node AsyncLocalStorage for a request-scoped correlation ID. Middleware runs
before body parsing, accepts only a single syntactically valid UUID in
X-Request-ID, normalizes its case, or generates a random UUID. Return the chosen ID
in X-Request-ID. It is a diagnostic label, not an authentication or trust signal.

Emit one HTTP completion record on response finish or premature close. Capture the
ID in the listener closure, use monotonic elapsed time, and log only method,
matched route template, status, duration, and completion outcome. Never log the
raw URL, query, or unmatched path.

Use a separate per-generation AsyncLocalStorage scope inside the OpenAI adapter
for metadata and attempt count. A transparent SDK fetch wrapper, installed at
client construction, counts actual transport attempts. This separate scope avoids
shared mutable counters when provider calls overlap, including within one HTTP
request. It delegates the original URL/options unchanged and never reads bodies.
The provider emits one final execution summary after validation or normalized
failure; HTTP/application errors include the request context too.

Use existing NestJS logging with ConsoleLogger JSON mode at bootstrap. Keep SDK
logging disabled. Construct log objects from allowlisted fields; never attach raw
errors, headers, authorization, keys, input, output, or schema/prompt contents.
Model metadata is restricted to a bounded identifier; invalid values are replaced.
No logging vendor, extra dependency, global service locator, or domain-contract
parameter is introduced.

## Alternatives and tradeoffs

- Passing IDs through service/provider methods would mix transport diagnostics
  into domain contracts.
- SDK debug output would leak too much and couple logs to SDK formatting.
- Replacing SDK retries merely to instrument them would risk changing ADR-003.
- Framework middleware registered after parsing would miss malformed JSON errors.
  Register the middleware before initialization in bootstrap and HTTP tests.

Transport duration ends when headers arrive or fetch fails. A response_received
attempt is not proof of valid output; only a successful execution summary means
final Zod validation passed. Body timeouts may trigger another SDK attempt even
after a response_received event. Final summary duration includes backoff and body
consumption. Attempt zero means no transport was observed (for example conversion
failure); manually constructed clients must use the wrapper for attempt records.

## Limits

Correlation is local to this process and not forwarded to OpenAI. Accepted IDs can
be reused by callers and are not guaranteed globally unique. UUID-only acceptance
limits log injection and arbitrary-header disclosure. Do not use IDs for access
control or place secrets in them. Async tasks spawned within a request retain its
context; separate requests and provider invocations remain isolated.

Premature HTTP close is logged but does not introduce new provider cancellation
behavior. Late transport completion after an existing deadline may be logged after
the execution summary. Logging is not durable storage and adds ordinary console
I/O overhead. Distributed tracing, metrics, log delivery, sampling, and retention
infrastructure remain out of scope. ADR-003 retries, timeouts, error categories,
and HTTP mappings remain unchanged.

## V0.2-004 — Tool execution summaries

The same local logging/correlation pattern now applies to ToolExecutor. Capture
request context at invocation and emit one final allowlisted tool_execution record
with safe registered tool name, monotonic duration, outcome, and normalized failure
code when applicable. Unknown names use a fixed marker; unsafe registered names
are redacted without changing registry acceptance or execution. Do not log tool
payloads, schema/description content, or required/granted permission lists.

Emit after executor settlement, not inside the handler or registry. This preserves
the discovery boundary and avoids a duplicate summary when ignored cancellation
finishes late. Catch logger delivery failures so observability cannot replace the
caller's result. No new execution ID, context scope, storage, or dependency is
needed for a single completion record per invocation. Reused request IDs can make
same-tool concurrent records indistinguishable; unique operation tracing is not
claimed. See [tool observability](../concepts/tool-observability.md) for fields and
limits. ADR-006 policy/deadline behavior is unchanged.
