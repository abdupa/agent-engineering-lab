# v0.3 Agent System Review

V0.3-006 reviews the implemented custom loop and its deterministic evidence.
No production defect or architecture violation requiring a correction was identified
in this review. No runtime refactor, dependency, release tag or new capability is
introduced. This review does not establish live model quality or learner mastery.

## Execution model and dependency direction

```text
Application caller -> AgentRunner.run(state, descriptions, options)
  -> AgentDecisionService.decide(state snapshot, descriptions)
     -> ModelProvider.generateStructured(transport schema)
     <- validated transport -> JSON decode -> canonical AgentDecision validation
  -> finish: return result and final state
  -> tool_call: ToolExecutor.execute(name, arguments, permission context)
     -> ToolRegistry lookup -> permission check -> input validation
     -> handler -> output validation
     <- validated result or safe ToolExecutionError
  -> validate/append observation -> next decision within remaining budgets
```

The runner owns ordering and run control, not reasoning, SDK details or handlers.
The decision service depends on ModelProvider and receives name/description records
only. ToolExecutor owns lookup, permission enforcement and actual invocation;
ToolRegistry supplies registered definitions without granting permission. The
agent's domain depends on safe tool failure codes intentionally, not provider errors.
Nest Logger and existing request context are the runner's infrastructure dependencies.
See [ADR-007](../../adr/ADR-007-agent-domain-contracts.md) and
[ADR-008](../../adr/ADR-008-bounded-agent-loop.md) for the accepted decisions.

There is no agent endpoint or startup consumer: AppModule still wires the existing
research application. The agent components are exercised through direct composition
in tests. This is deliberately unwired capability, not evidence of a deployed agent
or a reason to invent application integration during this review.

## Boundaries and complexity findings

| Boundary                 | Finding and reason to retain it                                                                                                                                                                                                                                                                                 |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Domain versus transport  | Canonical arguments are JSON objects. The model transport uses a root object wrapper and argumentsJson; decoding occurs before canonical validation. This avoids leaking strict provider schema limitations into the domain.                                                                                    |
| Tool-specific validation | JSON parsing proves syntax and the domain schema requires an object; neither proves valid addition arguments. Only ToolExecutor applies the selected tool's schemas.                                                                                                                                            |
| Repeated validation      | Service validation establishes its return contract; runner validation guards the action boundary and creates owned snapshots. Executor output validation establishes tool validity; observation validation establishes JSON compatibility. These checks have distinct purposes despite some repeated traversal. |
| Permission authority     | Trusted caller grants stay outside state/model inputs. Tool discovery does not authorize execution. Model-selected names still pass through the executor.                                                                                                                                                       |
| Abstractions             | Existing ModelProvider and small decide/execute dependency surfaces are sufficient. No separate planner, transport framework, generic workflow engine or new dependency is needed.                                                                                                                              |
| Coupling                 | Handler/schema pairing remains trusted registration. Tool failure-code mapping is explicitly exhaustive. Agent imports no OpenAI SDK; SDK compatibility checks belong to tests.                                                                                                                                 |
| Test harness             | Scenario data and a shared evaluator remain under test/, excluded from production build. The executor spy calls through; fake transport responses still traverse the real translator.                                                                                                                           |

No dead branch or unused abstraction needing removal was identified in the inspected
agent path. Repeated state parsing can cost time for large histories, but optimizing
it without a measured requirement would weaken clarity for speculative benefit.
Descriptions are human-maintained argument guidance, not executable schemas; the
addition registration's brief description alone does not explain left/right fields.
Scripted tests do not establish whether that guidance is sufficient for a live model.

## Reliability and evidence

Defaults are six decisions and one 60000 ms whole-run deadline, configurable on
AgentRunner. Finish returns immediately; each tool decision invokes the executor at
most once. Exhaustion returns LOOP_LIMIT without an extra decision. Translation or
provider failure becomes DECISION_FAILED; invalid canonical output, invalid initial
input and unexpected internal failures terminate with their fixed safe categories.
Safe tool failures become ordered observations and permit another decision within
the existing budget. There is no automatic agent/tool retry; existing provider
reliability remains behind ModelProvider.

Optional caller cancellation and the absolute run deadline stop waiting and later
stages. They are not forwarded through interfaces that do not accept them. A tool
has its own default 5000 ms deadline and cooperative AbortSignal. In-flight work
may continue after the agent settles, and synchronous JavaScript cannot be preempted.
No hard cancellation or exactly-once action guarantee is implied.

One terminal agent_run log records requestId when available, started decision/tool
call counts, duration, outcome and safe failure code. Logs exclude payloads and
grants. Cleanup precedes best-effort logging; logging failure does not change results.
A recovered tool failure can coexist with a successful run. Request correlation is
not unique run identity, and console logs are not durable audit evidence.

## Verification

The repository suite passed: 274 deterministic tests in 15 suites. Formatting,
format:check, lint, typecheck, build and git diff --check passed. HTTP regressions
used localhost socket access. No live model call was made for this review.

Agent schema/service tests cover runtime contracts, malformed JSON, safe projections
and offline installed-helper conversion. Runner tests cover limits, deadline
accumulation, cancellation, late-work suppression, safe failures and validated output
provenance. Observability tests cover privacy, correlation and logger failures.
Six reusable trajectory scenarios cover immediate finish, addition then finish,
permission denial, invalid tool input, loop exhaustion and translation failure.
They check exact outcomes, calls, model-visible observations and decision counts.

Passing scripted responses proves deterministic composition for these fixtures. It
does not prove that a live model selects correct tools, uses observations, reasons
correctly or completes arbitrary goals. Earlier research-provider smoke evidence is
not a live agent trajectory verification. Failure runs intentionally expose no
partial state; evaluations inspect subsequent model inputs rather than hidden final
observations. Detailed deadline/cancellation evidence remains in the unit tests.

## Known limitations and deferred work

State is expected to be trusted acyclic JSON-compatible data. Schemas do not redact
secrets inside strings, prove the provenance of caller-supplied initial observations,
or bound goal/history/output size. Prompts separate instructions from data but do
not establish a security sandbox or prove prompt-injection resistance. Registered
schemas and handlers are trusted code. Explicit grants are a tool policy boundary,
not authentication or a full authorization system.

Finish means a structurally valid result, not verified goal completion. Repeated
actions are possible; no deduplication or side-effect safety is promised. Live model
quality, repeated-run reliability, statistical metrics, cost/latency benchmarking
and model comparisons remain deferred. So do provider-native tool calling, HTTP
agent integration, persistence, planning frameworks, memory, RAG, queues and
multi-agent behavior; none is authorized by this review.

The central lesson is that probabilistic decisions propose actions while deterministic
software owns validation, permission, ordering and termination. Continue with the
[mastery exercises](MASTERY.md). No next implementation task is defined in this SPEC.
