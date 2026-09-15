# v0.4 Orchestration Mastery

These exercises support learning; completion is not asserted. See [REVIEW.md](REVIEW.md)
for delivered behavior, evidence and limits. Paths below are relative to apps/api/src/orchestration.

| Concept                      | Implementation                       | Mastery question                                                                     |
| ---------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------ |
| Explicit control state       | orchestration.ts phase union         | Why does pendingCall belong only to awaiting_tool_result, outside AgentState?        |
| Legal transition             | transitionOrchestration              | What must match before an observation advances state? Why is matching not a receipt? |
| Restoration versus execution | checkpoint.ts                        | Why can a terminal checkpoint be inspected but never continued?                      |
| Conservative resume          | prepareCheckpointResume              | Why is awaiting_tool_result unsafe to replay even if its input is valid?             |
| One iteration                | orchestrator.ts advanceOnce          | Which operation consumes an iteration, and what happens on the last tool decision?   |
| Time accounting              | checkpoint.ts and pause.ts           | Why do ordinary checkpoint time and intentional pause time count differently?        |
| Authority                    | fresh context passed to ToolExecutor | Why does successful resume validation not grant tool permission?                     |
| Cancellation                 | advanceOnce stage checks             | What can still run after timeout, and which late effects are suppressed?             |
| Diagnostics                  | advance outer wrapper                | Why is terminal inspection logged without implying another model decision?           |
| Framework selection          | ADR-011                              | Which concrete requirement could justify reevaluating LangGraph?                     |

## Trace exercises

1. Trace a tool decision from an awaiting_decision checkpoint through executor
   validation and observation append. Identify the internal pending state and why
   it is not returned as an automatically resumable snapshot.
2. Serialize a checkpoint with one iteration consumed, restore it and continue.
   Explain what is validated and what is still trusted. Change the stored budget
   to another valid number: explain why this is not forgery detection.
3. Pause with 37 seconds left; wait an hour; resume and execute for ten seconds;
   pause again. Explain why 27 seconds remain and where the calculation lives.
4. Contrast that example with ordinary restoration after the original deadline.
   Explain why resume fails and why it must not assign a fresh full timeout.
5. Remove calculate from fresh grants after resume. Explain why the executor
   returns DENIED and why another decision may still be allowed.
6. Cancel while a tool ignores cancellation. Let it finish. Identify the tests
   proving that the settled snapshot and completion event remain final; list the
   real-world effects they cannot undo or prevent.
7. Explain why a paused envelope cannot advance, but retaining an old active
   checkpoint can bypass the application's intended pause. Identify the missing
   guarantees without claiming locking, replay protection or approval identity.
8. Compare this explicit iteration with a graph implementation. Explain why graph
   nodes would still call ModelProvider and ToolExecutor and retain domain validation.

Distinguish checkpoint from cache, execution state from long-term memory, resume
from retry, pause from cancellation and interrupt from failure. A correct explanation
names the owner of each invariant and the evidence needed for stronger guarantees.
