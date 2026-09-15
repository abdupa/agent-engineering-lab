# v0.1 — Reliable LLM Foundation

Status: Released (repository release record), 2026-09-13.

V0.1-011 — v0.1 Release and Mastery Review is complete. This closes the release in
the repository; it does not imply a deployment, package publication, or Git tag.

## Goal and architecture delivered

Accept a research objective and optional constraints and produce a validated
structured research plan through the smallest reliable LLM-backed application
slice. The NestJS/TypeScript application exposes POST /research/plan and a
process-only GET /health endpoint.

HTTP correlation middleware precedes body parsing. ResearchController validates
unknown input and maps failures. ResearchPlanService owns planning instructions,
serializes user data, and calls ModelProvider. OpenAIModelProvider uses the
Responses API with strict structured output and store: false, then decodes and
validates with ResearchPlanSchema before returning the parsed plan. The service
and controller do not duplicate output validation. ResearchModule owns concrete
provider configuration and injection.

Reliability includes provider-neutral errors, at most two SDK retries, a 10-second
attempt timeout, and a 30-second asynchronous deadline after schema conversion.
Safe HTTP mappings distinguish invalid input, refusal, invalid output,
unavailability, and timeout. X-Request-ID, AsyncLocalStorage, and allowlisted JSON
logs correlate HTTP completion, transport attempts, and final execution outcomes.
See [REVIEW.md](REVIEW.md) for the full execution model and boundary assessment.

## Completed milestones

| Milestone                                                         | Delivered result                                                             |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| V0.1-001 — Repository and Engineering Foundation                  | pnpm workspace, Nest API, configuration, health endpoint, engineering checks |
| V0.1-002 — Research Domain Contracts and Structured Output Schema | Zod schemas and inferred types with deterministic validation tests           |
| V0.1-003 — ModelProvider Abstraction                              | Generic schema-bearing generation contract and runtime injection token       |
| V0.1-004 — OpenAI ModelProvider Implementation                    | Responses integration, structured output, final Zod validation               |
| V0.1-005 — ResearchPlanService                                    | Application-owned instructions and provider-neutral planning use case        |
| V0.1-006 — Research Planning HTTP Endpoint and Provider Wiring    | Transport validation, HTTP endpoint, production composition                  |
| V0.1-007 — Provider reliability and application error handling    | Bounded retries/deadlines, normalized errors, safe HTTP mappings             |
| V0.1-008 — Structured Observability                               | Safe correlated HTTP, attempt, and execution logs                            |
| V0.1-009 — Live OpenAI Integration Verification                   | Explicit manual smoke command and successful user-run live verification      |
| V0.1-010 — v0.1 Architecture and Learning Review                  | Execution/boundary review; no application correction warranted               |

V0.1-011 records release evidence, mastery topics, the canonical Blueprint, and
the high-level v0.2 specification. It changes documentation only.

## Significant decisions

- [ADR-001](../../adr/ADR-001-nestjs-primary-backend.md): NestJS as primary backend.
- [ADR-002](../../adr/ADR-002-model-provider-abstraction.md): application-defined
  provider boundary, Zod contract, and concrete composition.
- [ADR-003](../../adr/ADR-003-provider-reliability.md): bounded SDK execution and
  safe application errors.
- [ADR-004](../../adr/ADR-004-structured-observability.md): local correlation and
  safe structured observability without domain-contract parameters.

These decisions remain in force; historical milestone notes in the ADRs explain
when behavior was introduced rather than the current release status.

## Verification record

Closure validation on 2026-09-13: pnpm format, format:check, lint, test, typecheck,
build, and git diff --check passed. **124 automated tests in six suites passed**.
Tests cover schemas, configuration, service behavior, composition, real SDK with
fake transport, and localhost HTTP integration. They need no real credentials and
make no external AI requests. No application or test changes were made in closure.

Manual OpenAI verification previously succeeded in V0.1-009. Evidence is the
user-supplied terminal output recorded in
[live verification](../../concepts/live-openai-verification.md):

| Observation          | Result                                                        |
| -------------------- | ------------------------------------------------------------- |
| Model                | gpt-5.6-luna                                                  |
| Upstream HTTP status | 200                                                           |
| Attempt              | First attempt succeeded                                       |
| Output boundary      | ResearchPlanSchema validated: true                            |
| Correlation          | Confirmed across attempt, execution, and smoke success events |
| Request ID           | 00c60548-f45d-46f0-817d-e161e5c416b9                          |
| Duration             | Approximately 3069 ms to headers; 3508 ms total               |

The manual command exercised the production provider binding and actual schema
with a minimal request. It bypassed the HTTP listener and normal service prompt.
HTTP-to-provider correlation is verified separately with deterministic transport.
No new live request was made for release closure.

## Known limitations and deferred capabilities

Structural validation does not establish factual correctness or research quality;
empty arrays and semantically weak plans can validate. The smoke establishes one
model/schema success at that time, not full live retry testing, live HTTP/service
verification, or model-quality evaluation. Prompt separation is not proof of
prompt-injection immunity.

Timeouts cannot preempt blocked synchronous work or guarantee remote cancellation.
Retries can repeat paid work, and SDK backoff timers may outlive the caller.
Client disconnect does not cancel generation. No explicit token/cost budget,
concurrency controls, authentication, or rate limiting is implemented. Health is
not provider readiness. This is not a public-deployment security assessment.

Correlation is process-local, IDs are diagnostic labels, and console logs have no
durable delivery guarantee. No distributed tracing is claimed. store: false does
not establish zero retention under all provider data policies.

Controlled tools, agent loops, additional providers, streaming, retrieval/RAG,
memory, persistence, queues, Redis, multi-agent systems, browser automation, MCP,
Python services, frontend, external telemetry, and semantic evaluations remain
outside v0.1. The [Blueprint](../../BLUEPRINT.md) is directional; the next scoped
release is [v0.2 — Controlled Tool System](../v0.2/SPEC.md). No v0.2 code is included.

## Learning and continuation

[MASTERY.md](MASTERY.md) identifies concepts and questions for the learner; release
completion is not a claim that anyone has answered or mastered those questions.
[CURRENT.md](../../CURRENT.md) now points to V0.2-001, planned only.
