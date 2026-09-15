# ADR-005 — Explicit tool contracts and registry

Status: Accepted

Date: 2026-09-13

## Context

V0.2-001 requires tool identity, purpose, input/output schemas, and an execution
operation plus explicit registration/discovery. Tools must remain independent of
research and model-provider SDKs. Controlled invocation is V0.2-002, not this task.

## Decision

Define Tool<Input, Output> using the existing Zod dependency and a typed async
execute function. Input means the schema's parsed output, including transformations.
The handler type does not itself enforce runtime input or output validation.

Use an ordinary instance-owned Map in ToolRegistry. register accepts typed tools;
get returns a definition or undefined; list returns a fresh discovery snapshot in
registration order. Names are exact and case-sensitive, non-empty, and without
surrounding whitespace. Descriptions must be non-blank. Duplicate registration
throws a fixed error and preserves the first definition. Do not silently normalize
names or include supplied identifiers in error messages.

Definitions are shallow copied and frozen at registration. Schemas and handler
references remain shared, not deeply frozen. Registration is for trusted TypeScript
composition code, not a JSON/plugin loading boundary. It does not execute handlers.

Heterogeneous lookup loses the concrete input type. RegisteredTool therefore uses
unknown schema/output types and a never handler parameter: discovery must not
claim that any arbitrary value is safe to pass to an unknown handler. Typed tool
objects retain their concrete signatures. Do not add get<T>() casts that let a
caller assert a relationship between a name and type without evidence. The later
executor must establish schema/handler correspondence at its invocation boundary;
this registry is not that boundary or a security sandbox.

No Nest module, injection token, provider integration, global singleton, permission
metadata, timeout machinery, or logging is added without its corresponding consumer
or task. ADR-001/002 remain unchanged.

## Alternatives and consequences

An SDK function-tool type would couple ordinary deterministic capabilities to a
vendor. A second schema abstraction would duplicate Zod. Dynamic discovery or a
plugin framework exceeds explicit registration requirements. A generic lookup cast
would provide misleading type safety. An executor inside registration would cross
into V0.2-002 before its validation requirements are implemented.

This small registry deliberately offers discovery only. It cannot enforce policy,
prevent direct handler invocation, validate execution results, or provide audit
records. V0.2-002 will add controlled invocation, V0.2-003 reliability and policy,
and V0.2-004 observability. Exact metadata fields follow those requirements.

## V0.2-002 — Validated invocation

ToolExecutor now resolves a definition, parses input with that definition's schema,
invokes its handler once, and parses output before returning it. Parsing uses
parseAsync to support asynchronous refinements/transforms. It returns unknown for
a dynamic name, not a caller-selected generic type.

A single private-to-the-operation function assertion bridges the registry's erased
handler type only after input parsing. Trusted typed registration establishes the
schema/handler pairing; this does not make arbitrary JavaScript registrations safe.
This avoids adding an execution operation to registry discovery or widening all
handlers to accept unknown. The schema and handler references come from the same
frozen definition. No unvalidated input crosses this assertion.

Unknown lookup, input validation, handler failure, and output validation reject
with fixed Error messages and no raw causes. Detailed failure codes, timeouts, and
permission policy remain V0.2-003. There are no retries or logs in this executor.
An unresponsive handler can still leave the promise pending.

The add-numbers example accepts an object containing two finite JavaScript numbers
(left/right) and returns their sum. Unknown keys are stripped by Zod; numeric strings
are rejected. Overflow to infinity fails output validation. This is a pure local
example, not arbitrary-precision arithmetic or a new HTTP/model capability.

## V0.2-003 follow-up

[ADR-006](ADR-006-tool-reliability-and-policy.md) adds explicit requiredPermissions,
execution context, safe error codes, and a whole-operation deadline. It supersedes
the earlier milestone's absence of timeout and policy enforcement. Discovery still
does not invoke or authorize a handler; schema/handler type pairing is unchanged.
