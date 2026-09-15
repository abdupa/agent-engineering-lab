# Structured observability

V0.1-008 adds local correlation and safe JSON logs to the existing research HTTP
slice. No service or ModelProvider parameters change, and the
[reliability policy](provider-reliability.md) remains in force.

## Request context

Every HTTP request passing through bootstrap middleware receives X-Request-ID.
Supply a standard UUID to reuse a caller correlation ID; otherwise the server
creates a random UUID. Duplicate, combined, overlong, and non-UUID header values
are replaced, never logged. Accepted IDs are lowercase. The middleware runs before
body parsing, so validation failures, malformed JSON, health requests, and 404s
also receive IDs.

Node AsyncLocalStorage carries the ID through asynchronous application work.
ResearchPlanService still sees only research input and ModelProvider. Provider
calls outside HTTP omit requestId rather than borrowing a previous request's ID.
The response-finish listener captures its ID explicitly, avoiding dependence on
which asynchronous context emits that event.

```text
HTTP X-Request-ID (validated or generated)
            |
            v
 AsyncLocalStorage request context
            |
     +------+-------------------+
     |                          |
 HTTP completion       Provider generation context
                                |
                         SDK fetch attempts
                                |
                      Final execution summary
```

## Events and timing

Nest's ConsoleLogger emits JSON at application startup and runtime. Application
event fields are in the JSON log's message object; Nest adds its own timestamp,
level, process ID, and context. Durations use performance.now() in milliseconds.

| Event                | Fields beyond event                                                                                            |
| -------------------- | -------------------------------------------------------------------------------------------------------------- |
| http_completed       | requestId, method, route, status, durationMs, outcome                                                          |
| provider_attempt     | requestId when available, provider, model, attempt, durationMs, outcome, status when received, code on failure |
| provider_execution   | requestId when available, provider, model, attempt, durationMs, outcome, normalized code on failure            |
| research_plan_failed | requestId when available, code, status                                                                         |

HTTP completion records are emitted once, on finish or premature close. Outcome
is completed or aborted. Route is a matched template, or unmatched when no route
is known. No raw path or query string is included. On aborted requests, status is
the current response status and does not mean the client received it.

Provider attempts start at 1 and count actual SDK fetch invocations, including
retries. A per-generation context keeps counters separate during concurrent work.
ResearchModule installs observeOpenAIFetch around the existing transport when
constructing the SDK. Custom/test clients should use that same wrapper.

Attempt duration covers fetch through receipt of headers, or transport rejection;
outcome is response_received, http_error, or transport_error. HTTP success is not
model-output validation. A later body read or schema validation can still fail.
The execution summary measures total generation through final validation or
failure, including retry waits and response consumption. Its attempt field is the
number of observed attempts; zero is possible before any transport call.

The SDK still selects retries, timeout handling, and backoff. The wrapper forwards
responses/errors and options without consuming bodies or changing headers. A
late transport log can follow the overall deadline summary. Correlation is local;
no request ID is sent to the external provider by this feature.

## Safe metadata

Logs are explicitly constructed; they do not contain API keys, authorization,
full prompts, objectives, constraints, schemas, complete output, raw response
bodies, or error causes. Model identifiers must contain only letters, numbers,
periods, underscores, colons, slashes, or hyphens and be at most 128 characters;
other values and sk-prefixed values are replaced with a fixed marker. SDK logging
stays off. Correlation IDs are diagnostic labels and must never carry secrets.

Tests cover generated and propagated IDs, invalid headers, malformed JSON, unknown
routes, retry metadata, normalized failures, conversion before transport,
concurrent isolation, and HTTP-to-provider correlation using fake transport.
Assertions check exact field sets and sensitive test markers. No test contacts
OpenAI. Live verification is V0.1-009, not part of this task; metrics, distributed
tracing, and external logging platforms remain excluded.
