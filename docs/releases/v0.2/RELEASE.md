# v0.2 — Controlled Tool System

Status: Released in the repository, 2026-09-13.

V0.2-006 — v0.2 Release and v0.3 Planning closes this release. This record does
not imply deployment, package publication, or creation of a Git tag.

## Goal and delivered architecture

Provide a provider/domain-neutral tool system for explicit deterministic discovery
and controlled execution, before introducing autonomous tool selection.

```text
Trusted registration -> ToolRegistry (discovery only)
name + unknown input + grantedPermissions -> ToolExecutor
  -> lookup -> permission check -> input validation
  -> handler(parsed input, context with AbortSignal), once
  -> output validation -> parsed result
  -> correlated completion record
```

Tool<Input, Output> declares name, description, requiredPermissions, Zod schemas,
and an async handler. ToolRegistry owns exact case-sensitive registration and
lookup, rejects duplicates, returns undefined for unknown names, and provides
ordered discovery snapshots. It copies/freezes definitions and permission arrays;
schemas and closures remain shared trusted code.

ToolExecutor checks that a permission context exists and all required permissions
are granted before schema callbacks or handler invocation. Missing context or any
missing grant means DENIED. An explicit empty context works only for tools with no
required permissions. Registration itself never authorizes execution.

Runtime parseAsync validates and transforms input before invocation and output
before return. Dynamic results remain unknown; a local handler assertion follows
parsing against the paired registered schema. The pure add-numbers example requires
calculate, accepts finite left/right numbers, and returns their finite JavaScript
sum. Numeric strings fail; extra fields are stripped; overflow fails output validation.

The configurable executor default is a **5000 ms whole-operation timeout**, covering
policy/input validation, handler execution, and output validation. Expiry rejects
with TIMEOUT and aborts the handler's signal. Checks between stages prevent late
validation from starting new handler work. There are no per-tool overrides or retries.

ToolExecutionError exposes NOT_FOUND, DENIED, INVALID_INPUT, EXECUTION_FAILED,
INVALID_OUTPUT, and TIMEOUT with fixed safe messages and no raw causes. One final
allowlisted tool_execution log captures outcome, safe tool identifier, duration,
failure category, and requestId when available through existing AsyncLocalStorage.
Logger failure cannot replace the result; ignored cancellation does not produce a
second completion summary when late work finishes.

Tools remain independent of research and OpenAI. No tool endpoint, automatic startup
registration, or agent is wired into the application. See [REVIEW.md](REVIEW.md),
[ADR-005](../../adr/ADR-005-tool-contracts-and-registry.md),
[ADR-006](../../adr/ADR-006-tool-reliability-and-policy.md), and
[ADR-004](../../adr/ADR-004-structured-observability.md) for boundaries and decisions.

## Milestones delivered

| Milestone                                         | Result                                                                     |
| ------------------------------------------------- | -------------------------------------------------------------------------- |
| V0.2-001 — Tool contracts and registry            | Typed/schema contracts and explicit registration/discovery                 |
| V0.2-002 — Controlled tool execution              | Input/handler/output execution boundary and deterministic addition example |
| V0.2-003 — Tool reliability and policy boundaries | Explicit grants, default denial, deadlines, cooperative abort, safe errors |
| V0.2-004 — Tool observability and auditability    | Safe correlated settlement records and privacy coverage                    |
| V0.2-005 — Tool system review and mastery         | Architecture review, verification limits, and learning questions           |

V0.2-006 adds this release record and the high-level v0.3 specification without
application changes. [MASTERY.md](MASTERY.md) is a learning artifact, not a claim
that the learner has completed the exercises.

## Verification

Release validation: pnpm format, format:check, lint, test, typecheck, build, and
git diff --check passed. **178 automated tests in ten suites passed**, including
124 v0.1 regression cases and 54 tool cases. Tool tests use deterministic handlers,
schema callbacks, virtual timers, and logger spies. HTTP regression tests bind
localhost; no test invokes a live model. No live OpenAI request was needed or made
for this transition. The prior v0.1 smoke is separate from tool-system verification.

## Known limitations and deferred capabilities

- Registration does not authorize execution. Grants come from trusted application
  code and are not complete authentication, identity, RBAC, or tenant policy.
- Direct handler invocation can bypass ToolExecutor if application code chooses
  to do so. This is not a sandbox for arbitrary plugins or executable schemas.
- Cancellation is cooperative. Synchronous handlers cannot be preempted; work
  ignoring AbortSignal may continue after the executor returns timeout. There is
  no rollback, process isolation, or guarantee that effects stopped.
- Logs are best-effort diagnostics, not durable audit storage. Process termination
  can lose records, and request IDs do not uniquely identify individual invocations.
  Identifier filtering cannot recognize every secret; tool names must be safe metadata.
- There are no retries. No agent currently selects or invokes tools autonomously.
- The addition example uses ordinary floating-point arithmetic. Tests do not prove
  safety of future external effects, hostile JavaScript objects, or load guarantees.

Agent loops, model-driven selection, RAG, memory, queues/workers, Redis, multi-agent
systems, browser automation, MCP, durable execution, frontend, and Python services
remain deferred. [v0.3 SPEC](../v0.3/SPEC.md) defines only the next release's scope;
[CURRENT.md](../../CURRENT.md) marks V0.3-001 planned, not implemented.
