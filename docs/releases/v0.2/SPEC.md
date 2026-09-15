# v0.2 — Controlled Tool System

Status: Released (2026-09-13). See [RELEASE.md](RELEASE.md) for closure evidence. V0.1 is released; V0.2-001 supplies contracts and registry.
V0.2-002 adds schema-validated execution and a deterministic addition example.
V0.2-003 adds tool permissions, safe failures, and cooperative deadlines.
V0.2-004 adds safe correlated execution summaries. V0.2-005 documents the completed tool review and mastery topics.

## Goal

Introduce a provider/domain-neutral tool architecture that can later be used by
an agent, without building the agent loop yet. Deterministic software must be able
to discover and invoke a registered tool through explicit, validated contracts and
a controlled execution boundary. Keep the existing v0.1 behavior intact.

## Scope and learning outcomes

- Tool contracts describe identity, purpose, Zod input/output schemas, and the
  execution operation without importing research types or provider SDK types.
- A small registry supports explicit registration and discovery. Define duplicate
  and unknown-tool behavior; do not add dynamic plugin loading or remote discovery.
- A controlled executor validates unknown input before invocation and validates
  output before returning it. Direct deterministic implementations demonstrate
  the contract without network access or model selection.
- Tool errors and timeout policy are explicit and safe. Define timeout/cancellation
  limitations for the selected tool behavior rather than claiming rollback or
  retrying side effects automatically.
- Permission/policy metadata describes relevant capabilities or effects. Metadata
  alone is not enforcement: execution must have a defined allow/deny boundary
  before effects. Exact policy fields should follow concrete tool requirements.
- Safe observability supports understanding which tool was invoked, its outcome,
  and duration with correlation when available. Auditability here does not imply
  durable audit storage, a database, or a telemetry vendor.
- Tests cover contract validation, registry behavior, controlled invocation,
  failures/timeouts, policy decisions, safe logs, and deterministic tool results.

Use the existing NestJS/TypeScript modular monolith, Zod, and local diagnostics
where practical. Specify the smallest useful deterministic example tools and exact
contracts during the relevant task before implementation. Do not introduce a
framework, transport endpoint, new dependency, or infrastructure without an
identified requirement and justification. ModelProvider remains the v0.1 model
boundary; tool execution is not an SDK-specific extension to it.

## Directional tasks

| Task                                              | Intended outcome                                                                                                                                          |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V0.2-001 — Tool contracts and registry            | Define neutral typed/schema contracts and explicit registration/discovery; test valid, duplicate, and unknown entries. No agent or model-based selection. |
| V0.2-002 — Controlled tool execution              | Add the invocation boundary and minimal deterministic examples; reject invalid input before invocation and invalid output before return.                  |
| V0.2-003 — Tool reliability and policy boundaries | Define safe failures, bounded execution, and enforceable allow/deny behavior based on concrete metadata; test denial before effects and timeout limits.   |
| V0.2-004 — Tool observability and auditability    | Add safe correlated execution records and privacy tests; explain audit evidence and storage limits.                                                       |
| V0.2-005 — Tool system review and mastery         | Review scope and boundaries, document execution and learning, and record verification and limitations.                                                    |

These tasks are directional and may be refined against actual requirements. Read
CURRENT before work; implement only the authorized task. A planned task is not
permission to implement the rest of the release.

## Acceptance and verification

The completed release should demonstrate deterministic discovery and controlled
execution with schema-validated input/output, predictable safe failures, explicit
policy enforcement, and useful safe execution records. Document dependency
direction and why each abstraction is necessary. Preserve v0.1 regression tests
and add focused deterministic tool tests; normal tests remain free of external
AI/network services. Run formatting, lint, tests, typecheck, build, and diff checks
for each completed task. Record significant new architectural decisions in ADRs
when concrete requirements justify them, not speculatively in this specification.

## Explicit non-goals

- Autonomous agent loop or LangGraph
- RAG or long-term memory
- Redis, queues, or multi-agent systems
- Browser automation or MCP
- Python service or frontend
- Tool selection by an LLM unless a later v0.2 requirement explicitly earns it

No v0.2 code is authorized by V0.1-011. The high-level specification establishes
future scope; it does not preselect libraries or infrastructure for later releases.

## V0.2-001 contract decisions

Tool<Input, Output> carries name, description, Zod schemas, and a typed async
execute operation. ToolRegistry uses explicit instance-owned registration, exact
case-sensitive names, fixed duplicate errors, undefined for unknown names, and
registration-order discovery snapshots. Names must be non-empty without surrounding
whitespace; descriptions must be non-blank. Registration does not invoke handlers.

Heterogeneous discovery does not assert a concrete handler input type. Definitions
are shallow snapshots; schemas/closures remain shared trusted code. See
[ADR-005](../../adr/ADR-005-tool-contracts-and-registry.md) for type erasure and
[the concept document](../../concepts/tool-contracts-and-registry.md) for limits.
No execution, policy, logging, module wiring, or production examples are part of
V0.2-001.

## V0.2-002 execution decisions

ToolExecutor resolves a name, parses unknown input asynchronously, invokes the
registered handler once, then parses and returns output as unknown. Fixed errors
identify lookup, input, handler, or output failure without retaining raw details.
No retries, timeout policy, permissions, logging, HTTP wiring, or LLM selection.

The minimal example is add-numbers: { left: finite number, right: finite number }
produces a finite numeric sum using JavaScript arithmetic. Extra keys are stripped;
numeric strings are rejected and overflow fails output validation. See ADR-005
and the controlled-tool-execution concept for the type boundary and limitations.

## V0.2-003 reliability and policy decisions

Every tool declares requiredPermissions. Execution receives grantedPermissions in
a context; missing context or any missing permission denies before invocation.
Discovery grants nothing. The addition tool requires calculate. No identity, role,
RBAC, organization, or external authorization system is introduced.

ToolExecutor has a configurable constructor timeout, default 5000 ms, covering the
whole policy/input/handler/output path. It passes an AbortSignal to the handler,
aborts on expiry, and rejects with normalized TIMEOUT. Cancellation is cooperative;
ignored signals may leave handlers running. No per-tool overrides, retries, circuit
breakers, queues, worker isolation, or distributed cancellation. Safe errors carry
fixed provider/domain-neutral codes and messages. ADR-006 records these decisions.

## V0.2-004 observability decisions

Use existing Nest logging and request context for one final tool_execution record
with a safe registered identifier, duration, outcome, optional requestId, and failure
code. Unknown requested names are omitted in favor of a fixed marker. No payloads,
permission lists, schemas, raw errors, or credentials are logged. Preserve results
if logger delivery throws, and avoid duplicate summaries after timed-out work ends.
These records are local diagnostic evidence, not durable audit storage. ADR-004
and the tool-observability concept document define field/privacy/timing limits.

## V0.2-005 review record

[REVIEW.md](REVIEW.md) records execution, boundaries, verification, and limitations.
[MASTERY.md](MASTERY.md) provides learning questions tied to implementation.
All five defined tasks are complete; no subsequent task, release publication, or
agent-loop implementation is authorized by this review.

## V0.2-006 release transition

V0.2 is released in the repository. The [v0.3 specification](../v0.3/SPEC.md)
establishes Custom Agent Loop scope; CURRENT identifies V0.3-001 as planned only.
This transition supersedes the V0.2-005 record's then-undefined next task. No
application code or v0.3 implementation was introduced during release planning.
