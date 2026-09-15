# v0.2 Tool System Review

V0.2-005, 2026-09-13. Reviewed the tool implementation, four tool test suites,
active SPEC, ADR-005/006, and ADR-004's tool observability decision. The defined
v0.2 task sequence is complete; this review does not publish or tag a release,
create a subsequent release specification, or authorize an agent loop.

## Execution and dependency model

```text
Trusted code -> explicit ToolRegistry registration/discovery
Caller: name + unknown input + grantedPermissions
  -> ToolExecutor lookup
  -> require context and all declared permissions
  -> inputSchema.parseAsync
  -> handler(parsed input, frozen grants + AbortSignal), once
  -> outputSchema.parseAsync
  -> parsed result (unknown to dynamic callers)
  -> one safe completion record
```

A whole-operation deadline starts before lookup/policy checking. Normalized failure
at any stage rejects the operation; the final logger still records its outcome.
The default 5000 ms timeout is configurable per executor, not per tool. Stage
checks prevent a late input parser from starting a handler, or a late handler from
starting output validation. Timer cleanup precedes logging.

Tool and its context types depend only on Zod/Node types. ToolRegistry owns an
instance-local Map and imports the contract, not research or a provider SDK.
ToolExecutor depends on the registry, neutral errors, Nest Logger, and existing
request correlation. This diagnostic framework dependency is intentional; it does
not put request IDs into tool contracts. addNumbersTool supplies deterministic
behavior and schemas. No tools are wired into AppModule, HTTP, ResearchPlanService,
or ModelProvider; callers explicitly construct the registry/executor.

## Boundary findings

| Concern                   | Finding                                                                                                                                                                                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contract versus execution | Discovery never executes or grants permission. The executor owns enforcement. No extra module, plugin loader, routing layer, or factory framework is needed.                                                                                                  |
| Dynamic typing            | RegisteredTool's never parameter prevents pretending a string lookup establishes an input type. A single executor assertion bridges erasure after parsing against the same registered schema. It relies on trusted typed registration, not a runtime sandbox. |
| Validation                | Input/output are distinct boundaries, not duplicate validation. parseAsync supports async refinements/transforms and returns parsed values. The handler annotation alone does not establish valid runtime output.                                             |
| Policy                    | All required permissions must be present before schema callbacks or invocation. Even a permission-free tool needs an explicit context. Caller grants are trusted; no authentication or grant issuance is implemented.                                         |
| Mutation                  | Definitions and copied permission arrays are frozen; discovery returns a fresh array. Schemas and closures remain shared trusted objects. Handler grant snapshots isolate later caller array mutation.                                                        |
| Reliability               | One deadline complements asynchronous stages; no retries repeat effects. Cooperative abort does not stop uncooperative handlers or undo work. Stage checks and timer cleanup have focused tests.                                                              |
| Errors                    | Six ToolExecutionError codes preserve fixed messages and discard handler/schema details. Unexpected failures from trusted composition infrastructure can still propagate; INTERNAL is a diagnostic fallback, not an added public error code.                  |
| Observability             | One final allowlisted record distinguishes validated success from failure. No payloads, permission lists, or raw errors. Logging failure cannot replace the result. Same-request invocations have no unique operation ID.                                     |
| Complexity and dead code  | Contract, registry, executor, error vocabulary, and example each serve an implemented requirement. Explicit example construction is intentional, not dead startup code. No clear requirement-driven runtime correction was identified.                        |

The addition example requires calculate, accepts finite left/right numbers, and
returns their finite JavaScript sum. Numeric strings fail input validation, extra
keys are stripped, and overflow fails output validation. This is an execution
example, not arbitrary-precision arithmetic or a model-selected tool.

No application code, dependencies, or tests changed during this review. Corrected
stale future-executor wording in the registry concept document. Existing ADR policy
remains unchanged; no new architecture decision is introduced.

## Verification and evidence limits

Full review validation passed: pnpm format, format:check, lint, test, typecheck,
build, and git diff --check. **178 deterministic tests in ten suites passed**:
124 existing v0.1 cases plus 54 tool cases (12 registry, 12 executor, 17 reliability,
13 observability). HTTP regression tests require localhost sockets. No live AI call
is needed or made for this tool review.

- Registry tests check registration, exact discovery, duplicate/unknown behavior,
  schema metadata, definition stability, instance isolation, and compile-time guards.
- Executor tests check parsed values, async transformations, rejection before
  invocation, sanitized handler/schema failures, and actual addition execution.
- Reliability tests use virtual time for deadlines across input/handler/output,
  cooperative abort, no later-stage work, permission denial, metadata/grant snapshots,
  concurrent signal isolation, constructor bounds, and timer cleanup.
- Observability tests assert exact fields, all normalized outcomes, redaction,
  correlation isolation, absent context, late completion, and logger failure.

These tests establish behavior for trusted in-process definitions, not arbitrary
plugins, hostile getters/proxies, real external side effects, or load/latency
service levels. Correlation tests enter AsyncLocalStorage directly for tools;
there is no live HTTP-to-tool endpoint to claim as verified. The v0.1 manual model
smoke is separate evidence and says nothing about tool policy or agent behavior.

## Known limitations and deferred capabilities

Direct handler invocation bypasses the executor. Permission names describe local
capabilities; a caller able to supply grants is trusted. This is not RBAC, user
identity, tenant isolation, or an authorization service. Registration assumes
well-formed TypeScript definitions and trusted executable schemas/closures.

JavaScript timers cannot preempt synchronous blocking. Ignored abort signals can
leave handlers running after timeout; schemas have no cancellation context.
There is no rollback, worker isolation, concurrency cap, circuit breaker, retry,
or distributed cancellation. Logger I/O can add overhead after measured execution.

Completion records are best-effort local diagnostics. Abrupt termination can lose
them; same-tool calls under a reused request ID can be ambiguous. Identifier
allowlists do not recognize every possible secret: registered names must be safe
metadata. There is no durable or tamper-evident audit store.

Autonomous loops, LLM selection, LangGraph, RAG, long-term memory, queues, Redis,
multi-agent systems, browser automation, MCP, Python services, frontend, and new
HTTP capabilities remain excluded. No next task is defined in the active SPEC;
further scope must be explicitly established before implementation.
