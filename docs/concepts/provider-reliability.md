# Provider reliability and application errors

V0.1-007 bounds generation and gives the HTTP application safe failure categories.
The [decision and tradeoffs](../adr/ADR-003-provider-reliability.md) preserve the
ModelProvider boundary and existing final Zod validation.

## Execution policy

Each OpenAI generation uses two retries maximum (three attempts), a 10-second SDK
attempt timeout, and a 30-second overall deadline covering asynchronous execution,
response consumption, and backoff. Deadline expiry aborts the request signal and
returns a timeout. The overall timer is cleared on success or failure.

We use the SDK's existing retry behavior, including backoff and provider retry
hints. It normally retries connection errors, timeouts, HTTP 408/409/429, and 5xx;
ordinary 400/401/403/404/422 failures are not retried. See the
[official SDK retry and timeout documentation](https://developers.openai.com/api/reference/typescript#retries).
No application retry wraps completed data validation. Refusal, missing output,
non-completed responses, malformed JSON, and Zod violations fail immediately.

The SDK may finish an internal Retry-After sleep after the caller's deadline, but
the aborted signal prevents another request. Tests cover this explicitly. These
bounds do not guarantee remote cancellation or exactly-once generation. They are
initial policy values, not latency measurements. Synchronous schema conversion
and an event loop blocked by other work cannot be interrupted by these timers.

## Error boundary

ModelProviderError has a fixed code/message and retains no raw error or cause.
The service propagates it; the controller uses its own fixed response messages.

| Code           | Meaning                                                                 | HTTP |
| -------------- | ----------------------------------------------------------------------- | ---- |
| TIMEOUT        | Attempt timeout after retries or overall deadline                       | 504  |
| UNAVAILABLE    | Connection failure, throttling, conflict, or provider 5xx after retries | 503  |
| INVALID_OUTPUT | Invalid JSON/schema, missing or non-completed output                    | 502  |
| REFUSED        | Provider refusal                                                        | 422  |
| CONFIGURATION  | Schema conversion failure or other upstream HTTP 4xx                    | 500  |
| INTERNAL       | Unclassified failure                                                    | 500  |

Non-500 mapped responses contain `statusCode`, `code`, and a fixed message.
Configuration, internal, and unknown exceptions retain the generic 500 response.
HTTP request validation remains 400 and performs no provider call. A provider 401
is not forwarded as a caller-authentication failure; credentials belong to this
application's composition boundary.

Each failed generation emits one structured NestJS warning with only
`event: research_plan_failed`, the normalized code, HTTP status, and requestId
when available. V0.1-008 also adds safe HTTP and provider attempt/execution logs;
see [structured observability](structured-observability.md). Prompts,
objectives, model output, SDK errors, headers, keys, and causes are never attached.
Production SDK logging is explicitly off, including when its environment log
level is set. This is minimal diagnostic context, not a full tracing system.

## Verification and deferred work

Tests use fake SDK transport and virtual timers for bounded retries, recovery,
timeouts before/after headers, deadline cancellation during backoff, and timer
cleanup. HTTP tests use the real service and a fake ModelProvider to verify every
mapping and the allowlisted log fields. No test calls OpenAI.

[Live smoke verification](live-openai-verification.md) succeeded in V0.1-009.
Model latency/quality evaluation, telemetry pipelines,
configuration tuning, and user-facing retry policy are deferred.
Health behavior, schemas, instructions, storage choice, and dependencies remain
unchanged.
