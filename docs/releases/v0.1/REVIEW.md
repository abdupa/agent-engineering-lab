# v0.1 Architecture and Learning Review

V0.1-010, reviewed 2026-09-12. The implemented research-planning slice follows
ADR-001 through ADR-004. No clear application defect or architecture violation
requiring a code change was identified. This review does not release v0.1.

## Execution model

```mermaid
sequenceDiagram
    participant H as HTTP caller
    participant C as ResearchController
    participant S as ResearchPlanService
    participant P as OpenAIModelProvider
    participant O as OpenAI Responses API
    H->>C: POST /research/plan (correlation middleware, body parsing)
    C->>C: Validate unknown body with transport Zod schema
    C->>S: Parsed objective and optional constraints
    S->>P: ModelProvider.generateStructured(instructions, input, schema)
    P->>O: Strict JSON Schema, store false, bounded SDK execution
    O-->>P: Response
    P->>P: Check completion/refusal, decode JSON, validate with supplied Zod schema
    P-->>S: Parsed ResearchPlan or normalized failure
    S-->>C: Unchanged result or failure
    C-->>H: HTTP 200 plan or safe error; X-Request-ID
```

Before Nest body parsing, middleware accepts a single UUID X-Request-ID (normalized
lowercase) or creates one. It sets the response header and starts request context.
Malformed JSON, unmatched routes, and validation failures also receive correlation.

The controller treats the body as unknown. Its transport schema requires a trimmed,
non-blank objective and accepts optional arrays of trimmed, non-blank constraints.
Unknown keys are stripped. Invalid input returns 400 before generation. This schema
is distinct from the output contract. Direct service callers must supply valid
input themselves; a TypeScript interface is not runtime validation.

ResearchPlanService owns planning instructions and serializes the objective and
constraints separately as user data. It supplies ResearchPlanSchema, makes one
logical generation request, and returns the provider result unchanged. It neither
retries nor maps errors and knows no model name, credentials, or SDK types.

ModelProvider exposes one generic operation plus a runtime injection symbol.
Its Zod schema contract promises parsed output, not just a type assertion. The
interface cannot enforce an implementation's validation obligation; adapter tests
verify it. Zod is intentional shared coupling, avoiding a second schema framework.

OpenAIModelProvider owns schema conversion, Responses request construction,
completion/refusal checks, output_text decoding, runtime validation, and normalized
failures. Research-specific fields and prompts stay outside this adapter.
ResearchPlanSchema requires all output fields and valid nested items, trims strings,
and strips unknown object keys; empty collections are permitted. Validation does
not prove that the objective was preserved or that the plan is useful or factual.

## Dependency direction and composition

ResearchController depends on ResearchPlanService; the service depends on the
ModelProvider contract and research schema. OpenAIModelProvider implements that
contract and depends on the OpenAI SDK, Zod helper, and local diagnostics.
The contract does not import the adapter. Runtime call direction toward OpenAI
must not be confused with source dependencies pointing toward the contract.

ResearchModule is the composition boundary: its inline factory reads ConfigService,
requires non-blank key/model settings, disables SDK logging, installs the observed
fetch transport, and binds the adapter to MODEL_PROVIDER. AppModule supplies
configuration and modules; main.ts installs HTTP observability and shutdown hooks.
Schemas have no Nest dependencies. The service uses Nest injection decorators, an
explicit framework coupling accepted by ADR-001 rather than a framework-free core.
Startup validates configuration presence without a paid request. Health checks
process liveness only; production startup still requires provider configuration.

## Reliability and observability

The SDK owns retry selection and backoff: at most two retries (three attempts),
10 seconds per attempt, and an adapter deadline of 30 seconds after synchronous
schema conversion. The overall deadline covers asynchronous generation and body
consumption, aborts the shared signal, and is cleared on completion. No application
retry repeats rejected output, malformed JSON, refusal, or final Zod validation.
SDK retry hints may override ordinary status selection within these bounds.

| Normalized category                      | Public HTTP status |
| ---------------------------------------- | ------------------ |
| TIMEOUT                                  | 504                |
| UNAVAILABLE                              | 503                |
| INVALID_OUTPUT                           | 502                |
| REFUSED                                  | 422                |
| CONFIGURATION, INTERNAL, unknown failure | 500                |

The adapter discards raw causes and messages. The controller owns fixed public
messages; upstream authentication failures do not become caller-authentication
errors. Schema conversion failures are configuration errors. An HTTP 200 from
OpenAI can still become INVALID_OUTPUT after response checks or validation.

Request AsyncLocalStorage carries correlation without service/provider parameters.
A separate per-generation scope counts actual fetch attempts without sharing
mutable counters across concurrent calls. The fetch wrapper does not consume
bodies or implement retries. HTTP completion logs once on finish or close;
provider attempt logs end at headers or transport rejection; execution summaries
include response consumption, backoff, and final validation. Durations use a
monotonic clock. The controller adds a correlated warning for generation failures.

JSON console logs allowlist IDs, safe model identifiers, attempt counts, durations,
status, outcome, and normalized categories. They omit prompts, input/output,
authorization, raw response bodies, and error causes. Routes are matched templates,
not raw paths or queries. SDK diagnostics remain disabled.

## Complexity and boundary findings

| Check                      | Finding and disposition                                                                                                                                                                                                                                                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Premature abstractions     | One provider interface serves a real test seam and SDK boundary. No routing, generic repository, extra AI module, or retry framework is needed. Retain it.                                                                                                                                                                |
| Duplicate validation       | HTTP input and model output are different trust boundaries. Production output is parsed once; service/controller do not reparse it. Smoke-only safeParse is an explicit verification assertion. Constructor/configuration checks protect separate entry points; retain them.                                              |
| Unnecessary dependencies   | Runtime packages serve Nest/Express/configuration, SDK integration, and Zod. RxJS and reflect-metadata are Nest peer requirements even without direct RxJS application imports. Development packages support current build/test/lint commands. No unused direct dependency identified; this is not a vulnerability audit. |
| Hidden coupling            | Attempt visibility requires the composition factory's fetch wrapper; manually constructed clients without it report zero observed attempts. Early middleware registration is also essential and repeated in HTTP tests. These documented integration obligations do not justify a new framework.                          |
| Misplaced responsibilities | Research instructions, transport validation/status mapping, and SDK mechanics remain in their respective layers. Local diagnostics in controller/adapter are intentional. No misplaced responsibility requiring correction found.                                                                                         |
| Dead code                  | Source exports, composition bindings, entry points, and test usage were inspected. No clear dead implementation identified. Manual smoke is intentionally outside startup and Jest.                                                                                                                                       |
| Excess architecture        | Two small context scopes solve correlation and concurrent attempt counting. Deadline wrapping complements SDK retry policy. Neither requires a telemetry platform or custom retry machinery.                                                                                                                              |

Small duplication of safe model checks and transport/final error classification is
visible. The latter describe different stages; extracting a generic policy layer
would not fix a demonstrated defect. Keep the current code. Historical milestone
wording in SPEC/ADRs remains historical; this review describes the implemented
system. Corrected two stale concept statements that still deferred live smoke
verification after V0.1-009 succeeded. No runtime correction or new ADR was needed.

## Verification evidence

The full validation suite for this review passed: pnpm format, format:check, lint,
test, typecheck, build, and git diff --check. All **124 automated tests in six
suites** passed; no tests or application code were changed.

- Schema tests verify required fields, nested types, trimming, stripping, and
  invalid data. Service tests use fake providers to check instructions, input
  separation, schema handoff, unchanged results, failure propagation, and injection.
- Configuration/composition tests exercise defaults, invalid settings, and provider
  construction without transport. SDK adapter tests use the real SDK with fake
  fetch and virtual timers for serialization, validation, retries, deadlines,
  cancellation, safe failures, and correlated metadata.
- HTTP tests bind localhost and exercise real Nest routing/controller/service with
  a fake provider, plus real-adapter/fake-transport correlation and concurrency.
  They cover input rejection, status mappings, malformed JSON, health, and privacy.
  Normal tests make no external AI calls and need no real credentials.

The V0.1-009 live smoke succeeded according to the user's supplied terminal output:

| Observation    | Recorded result                                            |
| -------------- | ---------------------------------------------------------- |
| Model          | gpt-5.6-luna                                               |
| Upstream HTTP  | 200                                                        |
| Attempts       | First attempt succeeded                                    |
| Runtime schema | ResearchPlanSchema, validated: true                        |
| Correlation    | All three events used 00c60548-f45d-46f0-817d-e161e5c416b9 |
| Duration       | Approximately 3069 ms to headers; 3508 ms total            |

The manual command uses the production binding with a minimal ResearchPlan request,
not ResearchPlanService's normal planning prompt or an HTTP listener. It confirms
live schema acceptance and provider execution; HTTP-to-provider correlation is
covered separately by deterministic tests. No additional live call was made in
this review. The installed SDK's existing zodTextFormat/create flow remains intact.

## Limitations and deliberately deferred capabilities

A successful schema check is not a quality evaluation. Empty arrays, duplicate IDs,
and semantically poor plans can pass. Separating instructions from user data does
not establish prompt-injection immunity. The smoke does not test generated nested
items, live refusal/retry recovery, all models, or sustained latency/load.

Timeouts are local bounds, not service-level guarantees: synchronous work cannot
be preempted, SDK Retry-After timers may outlive the caller, and remote processing
may continue after abort. Retries can duplicate paid work. Client disconnection
is logged but does not cancel generation. There is no explicit output-token budget,
application concurrency limit, authentication, rate limiting, or cost accounting;
this laboratory slice is not an assessed public multi-tenant deployment.

Correlation is process-local and not sent to OpenAI. IDs are caller-reusable labels,
not identities. Console logs have no durable delivery or retention guarantee;
late attempt logs can follow deadline summaries. store: false is a storage setting,
not a claim of zero provider retention. Model availability and schema acceptance
can change after the recorded smoke result.

Streaming, additional providers, routing, tools, agents, RAG, retrieval, databases,
queues, Redis, Python services, frontend, distributed tracing, metrics backends,
external logging, and model-quality evaluation remain deliberately deferred.
No such capabilities were added or implicitly authorized by this review.

## Learning review

The useful abstraction is the smallest contract that protects application behavior
and permits deterministic tests. A generic generation method achieves this without
predicting future providers. Runtime schemas join type safety to the external-data
boundary; they cannot substitute for semantic evaluation.

Reliability needs both attempt and operation bounds, and diagnostics need both
transport and validated-execution outcomes. A successful HTTP response alone is
insufficient evidence of successful generation. Correlation can remain an
infrastructure concern without spreading through domain method signatures.

Deterministic tests establish repeatable behavior; one manual live request answers
a narrower integration question. Keeping these evidence types separate makes the
release claims defensible. V0.1-011 — v0.1 Release and Mastery Review is planned
only; this review does not start it.
