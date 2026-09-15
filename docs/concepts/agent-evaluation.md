# Deterministic agent evaluation

V0.3-005 evaluates complete scripted trajectories using a fake ModelProvider and
real AgentDecisionService, AgentRunner, ToolExecutor and ToolRegistry. The fake
provider validates scripted transport responses against the requested schema;
JSON-text translation and canonical validation still run in AgentDecisionService.
A call-through executor spy observes calls without replacing execution or invoking
raw handlers. Production behavior and policy are unchanged.

The test-only [scenario contract and evaluator](../../apps/api/test/agent-evaluation/evaluate.ts)
accept a goal, scripted transport decisions, optional grants and iteration limit,
and exact expected terminal result/failure, executor calls, observations visible
at each decision, and decision count. Successful runs also check final observations.
All assertions must pass. Script exhaustion fails evaluation even if the resulting
normalized error would otherwise match. Timer cleanup and caller-state preservation
are checked. Run these evaluations as part of `pnpm test`.

[Scenarios](../../apps/api/test/agent-evaluation/scenarios.ts) cover:

| Scenario            | Required trajectory                                                                    |
| ------------------- | -------------------------------------------------------------------------------------- |
| Immediate finish    | One decision, exact result, no tool calls or observations                              |
| Addition            | One controlled addition returns 5, observed before the second decision finishes with 5 |
| Permission denial   | Missing grants produce DENIED, observed before a subsequent finish                     |
| Invalid tool input  | JSON-valid arguments fail the real input schema with INVALID_INPUT, then finish        |
| Loop exhaustion     | Two configured decisions and tool calls, then LOOP_LIMIT without another model call    |
| Translation failure | Malformed argument JSON produces DECISION_FAILED with no tool invocation               |

A requested executor call is not proof that its handler ran: denial and invalid
input are expected controlled failures. Failure runs intentionally expose no partial
state; the evaluator checks observations sent to subsequent decisions, not hidden
final state. Existing unit tests retain detailed timeout, cancellation, provider,
privacy and other edge-case coverage.

The key concept is separating deterministic trajectory correctness from model
quality. Exact expected results establish behavior for these scripted fixtures;
the fake provider does not reason about the goal or choose actions autonomously.
Passing proves neither live reasoning quality nor general goal completion.
Live model-quality evaluation, repeated-run reliability, statistical metrics,
cost/latency benchmarking and model comparisons remain deferred. No live calls,
LLM judge, probabilistic scores, persistence, external framework or dependency is
introduced.
