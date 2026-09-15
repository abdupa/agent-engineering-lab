# Checkpoint restoration versus resume

[Checkpoint helpers](../../apps/api/src/orchestration/checkpoint.ts) validate logical
state and preserved run budgets. They perform no I/O, model requests or tool calls.
Version 1 rejects unsupported formats. restoreCheckpoint accepts all four valid
phases for inspection; prepareCheckpointResume checks eligibility only.

| Phase                | Automatic continuation                                                                        |
| -------------------- | --------------------------------------------------------------------------------------------- |
| awaiting_decision    | Eligible only with remaining iterations, unexpired original deadline and fresh caller context |
| awaiting_tool_result | Rejected: effects may have occurred without a recorded observation                            |
| completed            | Inspection only; terminal                                                                     |
| failed               | Inspection only; terminal                                                                     |

Capture must occur at a quiescent boundary with no in-flight work. The future
orchestrator is responsible for establishing that fact, preserving started-decision
counts and preventing any work before resume checks. This module cannot prove it
from data. Logical phase matching is not a receipt of tool execution.

The envelope stores iterationsConsumed, maxIterations and deadlineEpochMs alongside
state and version. Resume returns their preserved values, never fresh budgets.
Equality with the deadline is expired; suspended wall-clock time counts. Fresh
permissions are separate and never stored or returned in the checkpoint. ToolExecutor
still decides whether a tool may execute. Eligibility does not start execution or
reset AgentRunner. Future execution must recheck budgets and use the fresh context.

The engineering concept is that restoration is validation of recorded progress,
while resume is a policy decision about safe continuation. Resume is not retry.
No storage, durability, crash recovery, concurrent/replay protection or exactly-once
effects are implemented. Checkpoint data is trusted domain data, not encrypted or
secret-redacted storage. Intentional human pauses may need a separate time policy
later. See [ADR-010](../adr/ADR-010-checkpoint-resume-semantics.md).
