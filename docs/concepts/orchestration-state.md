# Logical orchestration state

The [contract and pure transition function](../../apps/api/src/orchestration/orchestration.ts)
wrap AgentState without duplicating its goal or observations. The phase determines
which additional fields are permitted.

| Phase/event                                 | Next phase and data                                                 |
| ------------------------------------------- | ------------------------------------------------------------------- |
| awaiting_decision + finish                  | completed with validated result                                     |
| awaiting_decision + tool_call               | awaiting_tool_result with pendingCall                               |
| awaiting_tool_result + matching observation | awaiting_decision with observation appended and pendingCall removed |
| Either non-terminal phase + safe failure    | failed with existing agent failure code                             |
| completed/failed + any event                | Fixed invalid-transition error                                      |

Observation matching compares canonical names and structured arguments, independent
of object key order. Unrelated observations and wrong-stage events cannot advance
progress. Tool failures are observations too; they do not automatically terminate.
The helper parses copied data and performs no effects. It cannot prove a supplied
success observation came from ToolExecutor; future orchestration must enforce that
provenance. It neither executes tools nor replaces the existing runner.

Strict control envelopes reject conflicting fields; nested agent schema conventions
remain unchanged. Runtime objects are not state. Logical matching is not an action
identity, deduplication mechanism or permission check. State describes progress only:
there is no checkpoint durability, crash recovery or resume guarantee. Budgets,
deadlines, cancellation, persistence, interrupts and frameworks remain outside this
task. See [ADR-009](../adr/ADR-009-orchestration-contracts.md).

The key concept is making invalid phase combinations unrepresentable in the typed
union and rejecting illegal transitions at runtime. Tests cover JSON round trips,
phase invariants, matching observations, pure transitions and terminal rejection.
