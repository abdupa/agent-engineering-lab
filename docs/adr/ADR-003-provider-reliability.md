# ADR-003 — Bounded provider execution and safe application errors

Status: Accepted

Date: 2026-09-12

## Context

V0.1-007 implements the release requirements for timeouts, bounded retries, and
error normalization. Previously generation used SDK timeout defaults with no
retries, and HTTP failures were indistinguishable generic 500 responses. SDK
errors must not cross the application boundary or expose private request data.

## Decision

OpenAIModelProvider owns execution policy: two SDK retries at most, a 10-second
attempt timeout, and a 30-second overall asynchronous deadline after schema
conversion. The deadline rejects the caller and aborts the shared request signal.
The SDK owns retry selection, backoff, jitter, and Retry-After handling; there is
no second retry loop in the application. These are initial local policy choices,
not measured service-level guarantees. They are constants in code; no new
configuration surface is required for this milestone.

Normalize generation failures to one provider-neutral ModelProviderError carrying
only a fixed code and safe message. Distinguish timeout, unavailability, invalid
output, refusal, configuration, and internal failure. ResearchPlanService remains
unchanged. ResearchController maps codes to HTTP status and fixed public messages,
and logs only an event name, code, and status. Production SDK logging is disabled
to prevent its request/response diagnostics from bypassing this boundary.

## Alternatives considered

- A custom retry framework would duplicate the installed SDK's supported behavior.
- A per-attempt timeout alone would not bound accumulated attempts and backoff.
- Passing SDK errors through would couple HTTP behavior to vendor details and risk
  disclosing messages, headers, payloads, or nested causes.
- A large exception hierarchy or global filter is unnecessary for one endpoint.

## Consequences and limits

At most three attempts occur, and no new request starts after the deadline.
An SDK Retry-After sleep may remain pending until its own timer expires (up to
60 seconds in the installed SDK); abort prevents the subsequent request. The
caller does not wait for that sleep. Event-loop blocking cannot be preempted by a
JavaScript timer. Abort does not guarantee cancellation of processing already
accepted by the remote model; retries can repeat generation and incur charges.

Malformed JSON, schema violations, refusals, and non-completed response payloads
are not retried by application code. Ordinary non-transient HTTP 4xx errors are
configuration failures rather than caller authentication/validation errors. SDK
retry-hint headers can override its usual status-based selection, still subject
to the attempt and overall bounds.

Fixed diagnostic categories deliberately discard upstream detail. Tracing,
metrics, tuning based on live latency, and end-user retry policy remain future
work. V0.1-008 adds local request correlation and safe structured logs in
[ADR-004](ADR-004-structured-observability.md), without changing this policy. No dependency, provider routing, or infrastructure is
added. The release remains in progress.
