# v0.1 — Reliable LLM Foundation

Status: Released (2026-09-13). See [RELEASE.md](RELEASE.md) for closure evidence
and the complete milestone record. Task-specific restrictions below preserve
historical scope; they do not describe missing functionality in the final release.

## Objective

Build the smallest reliable AI-backed capability in the Laboratory:
accept a research objective and produce a validated structured research plan using
an LLM provider. Delivered incrementally through the milestones below.

## Delivered capability

`POST /research/plan`

Input example (objective required; constraints optional):

```json
{
  "objective": "Compare PostgreSQL, MongoDB and DynamoDB for an AI SaaS platform",
  "constraints": [
    "Multi-tenancy is required",
    "Operational simplicity is important"
  ]
}
```

Structured response example:

```json
{
  "objective": "...",
  "researchQuestions": [{ "id": "q1", "question": "...", "rationale": "..." }],
  "assumptions": [],
  "requiredEvidence": [{ "topic": "...", "reason": "..." }],
  "unknowns": []
}
```

The completed v0.1 release establishes NestJS application structure, an AI
provider abstraction, structured LLM output, runtime schema validation,
configuration, timeouts, bounded retries, error normalization, structured logging,
unit testing, and integration testing.

## V0.1-001 — Repository and Engineering Foundation

Scope:

- pnpm workspace and a simple NestJS API under `apps/api`.
- Strict TypeScript, linting, formatting, and baseline tests.
- Basic environment configuration with startup validation and `.env.example`.
- `GET /health` returning HTTP 200 with `{ "status": "ok" }`.
- Root README, AGENTS, BLUEPRINT, CURRENT, this specification, and ADR-001/002.

Acceptance criteria:

- Dependencies install with a committed pnpm lockfile.
- Lint, formatting check, tests, type checks, and build pass.
- Unit tests cover configuration; HTTP integration tests cover health behavior.
- Verify the compiled application's health endpoint over HTTP.
- Update CURRENT to mark V0.1-001 completed and identify the next task.
- No research planning, provider interface implementation, or LLM integration.

## V0.1-002 — Research Domain Contracts and Structured Output Schema

Define the ResearchQuestion, RequiredEvidence, and ResearchPlan runtime schemas
using Zod in the API application. Infer their TypeScript types from the schemas.
Keep these in a small research schema area without Nest modules or services.

All conceptual response fields above are required. Strings are trimmed and must
remain non-empty; arrays may be empty but must contain the declared item types.
Nested objects are validated. Unknown object keys are stripped. Do not introduce
ID formats, uniqueness constraints, or arbitrary size limits.

Acceptance criteria:

- Valid data parses; representative invalid data is rejected with focused unit tests.
- Cover missing fields, wrong primitive/array types, malformed nested objects, and
  empty required strings. Tests are deterministic and call no external services.
- Explain structured output and runtime validation in `docs/concepts/structured-output.md`.
- Formatting, lint, all existing and new tests, type checks, and build pass.
- Mark V0.1-002 completed in CURRENT and identify V0.1-003 as next planned task.

No LLM SDKs/calls, ModelProvider implementation, ResearchPlanService, research HTTP
endpoint, or additional infrastructure are authorized in V0.1-002.

## V0.1-007 — Provider reliability and application error handling

Implement the release's timeout, bounded retry, and error-normalization requirements
for the existing vertical slice. Keep SDK details inside the concrete provider.
Use a small provider-neutral failure contract and safe HTTP mappings, with no raw
SDK messages, prompts, response bodies, credentials, or causes in responses/logs.
Record the concrete execution policy and tradeoffs in ADR-003.

Acceptance criteria:

- Bound SDK retries to two, each attempt to 10 seconds, and asynchronous generation
  overall to 30 seconds, aborting pending transport on deadline expiry.
- Normalize transient failures, configuration failures, invalid output, refusals,
  and unexpected errors. Do not retry output validation in application code.
- Preserve HTTP 400 input rejection, successful schema-validated results, and health.
- Test attempts, recovery, timeouts, cancellation, safe HTTP mappings, and sanitized
  diagnostics using fake transport/providers and virtual time, without live calls.
- Run formatting, lint, tests, typecheck, build, and diff checks; update CURRENT.

No provider routing, new dependencies, infrastructure, or live smoke tests are
part of this task. See CURRENT for completion and subsequent task status.

## V0.1-008 — Structured Observability

Add safe, correlated HTTP completion and provider execution/attempt logs using
existing Node/NestJS capabilities. Return a request correlation ID in a response
header, safely propagate supported incoming IDs, and preserve domain contracts.
Log allowlisted metadata only, with durations, outcomes, and normalized failure
categories. Preserve ADR-003 retry/error behavior. Verify IDs, concurrency,
provider retry observability, failures, and absence of sensitive payloads using
fake providers/transports. Record design in ADR-004; run all standard checks.

No telemetry dependencies or platforms, distributed tracing, metrics backends,
cost accounting, or new AI capabilities. Next planned task: V0.1-009 — Live OpenAI
integration verification; do not implement it within V0.1-008.

## V0.1-009 — Live OpenAI Integration Verification

Provide an explicitly manual smoke command requiring `OPENAI_API_KEY` and
`OPENAI_MODEL`. Use one minimal structured generation through the existing
production provider, verify runtime schema validation, and print only safe
metadata. Preserve `store: false`, retry/deadline policy, and observability.
Inspect installed SDK Structured Outputs support; change the provider only if
needed for correctness or a clear simplification. Keep normal tests deterministic
and network-free; do not run the command during startup or CI tests.

Run all repository checks. Mark this task complete only after an actual live
request succeeds; absent configuration leaves it pending with the precise reason.
Only after success, set V0.1-010 — v0.1 Architecture and Learning Review as next
planned. See CURRENT for execution status.

## Explicit v0.1 non-goals

- Autonomous agents and multi-agent systems
- LangGraph
- RAG, embeddings, and vector databases
- Redis and queues
- PostgreSQL persistence
- Python services
- MCP
- Browser automation
- Frontend UI

## Additional strict exclusions for V0.1-001

Do not add OpenAI, Anthropic, or Gemini SDKs; LangChain; AI agents; Kafka;
Temporal; Python or FastAPI; Docker; Kubernetes; Playwright; or any of the
release non-goals above. Do not implement ModelProvider yet. Provider-specific
reliability, research schemas, and structured AI logging are future work.
