# ADR-006 — Tool reliability and permission boundary

Status: Accepted

Date: 2026-09-13

## Context and decision

V0.2-003 requires explicit tool permissions, bounded whole-operation execution,
cooperative cancellation, and safe domain/provider-neutral failures. These are
local tool controls, not authentication or an external authorization system.

Every Tool declares requiredPermissions (an explicit array, possibly empty).
ToolRegistry validates permission names and freezes a copied array. Names are exact,
case-sensitive, non-blank strings without surrounding whitespace. Registration and
discovery grant no permissions. add-numbers requires the single permission calculate.

ToolExecutor.execute receives a ToolPermissionContext containing grantedPermissions.
Missing context or any missing required permission denies execution before input
schema callbacks or the handler. An explicit empty grant list is valid only when
no permissions are required. Extra grants are allowed. Grant arrays are copied and
frozen before asynchronous work, so caller mutation does not change handler context.
The caller is trusted to supply grants; this does not establish who may grant them.

ToolExecutionContext passed to handlers includes grants and an executor-owned
AbortSignal. A constructor timeout defaults to 5000 ms and must be a positive
integer within Node's supported timer range. There are no per-tool overrides.
The deadline starts before lookup/policy checking and covers input parsing, handler
execution, and output parsing. Timer expiry rejects with TIMEOUT and aborts the
signal. Checks between stages prevent late input validation from starting a handler
and late handlers from starting output validation. Timers are cleared on settlement.

ToolExecutionError carries one fixed code/message and no raw cause: NOT_FOUND,
DENIED, INVALID_INPUT, EXECUTION_FAILED, INVALID_OUTPUT, or TIMEOUT. Existing fixed
validation/handler messages are preserved. Handler-thrown errors, including ones
imitating policy codes, become EXECUTION_FAILED unless the deadline has expired.
There are no retries or logs in this milestone.

## Tradeoffs and limitations

One overall deadline bounds accumulated asynchronous work, unlike a handler-only
timeout. No worker isolation is added: synchronous work cannot be preempted by a
JavaScript timer. Elapsed-time checks reject late results at stage boundaries.
Schemas are trusted executable code and do not receive the signal. Handlers must
cooperate with abort; ignoring it may continue work after timeout. A rejected call
does not roll back effects. Direct handler calls bypass this executor.

The registry remains discovery-only, the dynamic schema/handler assertion remains
inside the validated executor, and the research/ModelProvider contracts are
unchanged. No users, roles, RBAC, organizations, auth service, circuit breaker,
queue, worker, or distributed cancellation is introduced. V0.2-004 owns tool
observability; a later real requirement must justify any broader policy mechanism.
