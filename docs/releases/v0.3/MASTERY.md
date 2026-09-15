# v0.3 Agent System Mastery

These exercises support learning; they do not record that the learner has completed
them. [REVIEW.md](REVIEW.md) records architecture and verification evidence. Source
paths are relative to the repository root.

| Concept                     | Implementation                                                   | Explain before proceeding                                                                                                               |
| --------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Domain/transport separation | apps/api/src/agent/agent.schema.ts and agent-decision.service.ts | Why are canonical arguments objects while argumentsJson is a string? Which checks occur after decoding?                                 |
| One decision versus a loop  | AgentDecisionService.decide and AgentRunner.run                  | Who requests one decision, and who determines whether another decision is allowed?                                                      |
| Controlled action           | apps/api/src/tools/tool-executor.ts                              | Why do registration, JSON parsing and tool selection each fail to grant execution permission?                                           |
| Observation provenance      | AgentRunner after executor.execute                               | Why must success use the executor's validated return rather than raw handler output? What can the observation schema not prove?         |
| State ownership             | AgentRunner state parsing and per-decision snapshots             | Why keep budgets and grants outside state? What trust is still placed in initial observations?                                          |
| Failure continuation        | AgentRunner ToolExecutionError catch                             | Why can DENIED become an observation while DECISION_FAILED terminates? Why is a subsequent model-requested call not an automatic retry? |
| Bounded execution           | AgentRunner for-loop, check and Promise.race                     | Why is the whole-run deadline not reset? What happens when the last allowed decision calls a tool?                                      |
| Cancellation                | Runner stage checks and ToolExecutor AbortController             | What may continue after TIMEOUT or CANCELLED? Why can synchronous work exceed a nominal deadline?                                       |
| Safe diagnostics            | AgentRunner catch/finally                                        | Why can a successful run contain tool failures? What do started-call counters measure, and why is requestId not a unique run ID?        |
| Evaluation evidence         | apps/api/test/agent-evaluation/evaluate.ts                       | Why do exact fixture results not establish live reasoning quality? How does the evaluator catch an extra model call?                    |

## Trace exercises

1. Trace the addition scenario from fake transport response to final result 5.
   Identify the wrapper parse, JSON decode, domain parse, permission check, input
   parse, handler, output parse and observation append in execution order.
2. Remove calculate permission. Predict the safe tool code, next model-visible
   state, decision count and final result. Explain why a call-through spy records
   an executor call even though no handler should execute.
3. Contrast malformed argumentsJson with a JSON object containing left: "two".
   Explain why one terminates at decision translation and the other can become an
   INVALID_INPUT observation. Locate the corresponding evaluation scenarios.
4. Use a two-iteration budget with two tool decisions. Explain why LOOP_LIMIT is
   correct even if both additions succeed, and why no forced finish is requested.
5. Trace cancellation while a decision is pending. Explain what the runner stops,
   what the provider may still do, and why late work cannot start another tool.
6. Explain the evidence needed to claim a live model reliably solves addition
   goals. Separate the current deterministic assertions from deferred live trials,
   repeated-run statistics and model comparisons.

A satisfactory explanation identifies the owning component and observable outcome
for each boundary, not merely the class names. Do not claim mastery from test counts
or introduce future capabilities to complete these exercises.
