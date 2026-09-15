# One iteration per advance

Orchestrator.advance in apps/api/src/orchestration/orchestrator.ts composes the
single-step decision service and ToolExecutor with existing logical transitions.
The caller supplies a validated/restorable checkpoint, safe descriptions and fresh
permissions on every call. The function returns an independent logical checkpoint:
completed, failed, or awaiting_decision after one tool observation. It never returns
an ambiguous pending call for automatic resume.

Started decisions consume one iteration. A tool failure remains a safe observation;
agent failures terminate. The original deadline includes time between advances.
No extra model call forces a finish on exhaustion. Malformed input rejects safely;
terminal input is inspection-only. Failed checks never restart pending tools.

Timers/listeners are cleaned up and late work cannot start a subsequent stage.
Stopping waiting does not stop all underlying work. Snapshots are not stored,
locked, replay-protected or crash-safe. Existing AgentRunner is not replaced.
The key concept is separating one bounded unit of execution from caller-controlled
continuation while preserving authority at ModelProvider and ToolExecutor.
See [ADR-011](../adr/ADR-011-single-iteration-orchestration.md) for the LangGraph
comparison and decision to retain the custom implementation.
