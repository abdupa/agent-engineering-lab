# v0.3 — Custom Agent Loop

Status: Released. V0.3-001 through V0.3-006 completed; V0.3-007 records release
closure and v0.4 planning in [RELEASE.md](RELEASE.md). Architecture and learning
artifacts are [REVIEW.md](REVIEW.md) and [MASTERY.md](MASTERY.md).

## Goal

Build the smallest explicit agent execution loop that can reason over a goal,
choose between finishing and invoking registered tools, execute tools only through
ToolExecutor, incorporate observations into state, and terminate safely. Teach
agent architecture directly before introducing an agent framework.

## Architecture and boundaries

```text
AgentService / AgentRunner
        |
        +--> ModelProvider
        |
        +--> ToolExecutor
                 |
                 +--> ToolRegistry
                 |
                 +--> controlled tools
```

Class names are directional, not implementation authorization. Agent/application
code depends on ModelProvider rather than OpenAI SDK details. Tool actions execute
only through ToolExecutor, retaining required/granted permissions, runtime input
and output validation, existing deadlines, safe failures, and completion logging.
The agent must not receive raw handlers. Any discovery data exposed to reasoning
must exclude executable handler references; ToolRegistry remains discovery/lookup,
not execution or authorization. Exact metadata projection belongs to implementation.

State is explicit and typed. Each loop has explicit termination conditions and
bounded execution. Model decisions are runtime validated before they can direct
action. Failures remain safe and observable. No framework may hide the loop's
core mechanics. Existing research and tool behavior must remain intact.

## Initial decision concept

Only two decision kinds are in scope:

- finish: terminate with the agent's result.
- tool_call: identify a tool name and structured arguments for controlled execution.

Design the exact schema and state fields in V0.3-001. This transition does not
prescribe discriminator spelling, final-result shape, observation envelopes, or
SDK-specific function-call formats. Schema design must remain compatible with the
application's structured generation and runtime validation boundaries.

## Directional tasks

| Task                                                | Intended outcome                                                                                                                                                                     |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| V0.3-001 — Agent state and decision contracts       | Define explicit typed state and runtime finish/tool_call decision schemas, with focused deterministic validation tests. No loop yet.                                                 |
| V0.3-002 — Single-step agent decision service       | Produce one validated decision through ModelProvider using goal/state and safe tool descriptions; no raw handlers or vendor SDK types in agent code.                                 |
| V0.3-003 — Bounded custom agent loop                | Implement visible decision/action/observation transitions, invoke tools only through ToolExecutor, and enforce explicit termination and execution bounds.                            |
| V0.3-004 — Agent failure handling and observability | Define safe failure propagation and correlated diagnostics while preserving model/tool policies and excluding sensitive payloads.                                                    |
| V0.3-005 — Agent evaluation foundations             | Establish repeatable scenarios and explicit behavioral criteria for goal completion, tool use, and safe termination; distinguish deterministic coverage from model-quality evidence. |
| V0.3-006 — Agent system review and mastery          | Review architecture, verification, limits, and learning before further evolution.                                                                                                    |

Refine each task against its actual requirements before code changes. Exact loop
budgets, cancellation across model/tool boundaries, observation representation,
failure continuation rules, and evaluation criteria remain decisions for the
appropriate tasks. Missing material policies must be resolved before implementation;
this directional list does not authorize inventing them silently.

## Acceptance and verification direction

Demonstrate finish without tool invocation, validated tool selection/arguments,
permission-controlled execution, incorporation of observations, and bounded safe
termination. Agent code must not bypass executor policy or couple to OpenAI.
Test invalid model decisions and failure/budget paths deterministically. Preserve
existing regression tests and use fake ModelProvider responses for normal loop
tests; live requests must not become part of normal tests or startup. Separate
behavioral evaluations from unsupported claims about reasoning quality.

Run repository formatting, lint, tests, typecheck, build, and diff checks for
completed tasks. Record lasting architecture decisions through relevant ADRs when
requirements are settled. No new infrastructure or dependency is implied here.

## Explicit non-goals

- LangGraph or another framework hiding the core loop
- RAG, embeddings, or long-term memory
- Redis or queues/workers
- Multi-agent or planner/executor architecture
- Browser automation or MCP
- Durable execution or Temporal
- Frontend or Python service
- Autonomous high-risk actions
- Retries of side-effecting tools unless explicitly justified by a later task

V0.2-006 established this specification only. V0.3-001 implements domain schemas
and types; service, runner, and model-selected tool invocation remain later tasks.

## V0.3-001 approved domain contract

AgentDecision uses type finish with trimmed non-empty result text, or type
tool_call with non-empty toolName and JSON-compatible object arguments. AgentState
contains a non-empty goal and ordered tool observations. Each observation records
the requested call and either a validated JSON-compatible ToolExecutor result or
an existing safe tool failure code. No raw errors, handlers, grants, AbortSignals,
provider internals, or log envelopes are included. Successful result provenance
must be enforced by future execution code, not inferred from schema validation.

These are internal runtime/domain contracts. AgentDecisionSchema is not necessarily
a schema that can be passed directly to OpenAI Structured Outputs. Offline installed
helper checks reject root union/anyOf and arbitrary object maps requiring open
additionalProperties. Strict objects require additionalProperties: false.

V0.3-002 must evaluate an object wrapper with JSON-text arguments parsed into domain
values before ToolExecutor validation, and nested tool-specific structured schemas
derived from registered input schemas if supported without undue complexity. Neither
strategy is implemented here; canonical domain arguments remain objects. ADR-007
records the boundary. Counters, budgets, deadlines, continuation rules, planning,
memory, provider calls, and tool invocation remain outside V0.3-001.

## V0.3-002 authorized translation

Use a root object wrapper with a nested finish/tool_call decision. Tool arguments
are argumentsJson only in the model transport. After ModelProvider validation,
decode JSON and validate AgentDecisionSchema, requiring object arguments. Return
fixed safe translation failures without raw parse errors. Do not validate against
tool-specific schemas or execute tools; ToolExecutor retains those responsibilities.

AgentDecisionService accepts projected name/description records, never handlers,
registry internals, grants, signals, or executor internals. It depends on ModelProvider
without SDK imports and makes one request. Input data is separate from instructions.
The evaluated nested tool-specific alternative works for fixed addition fields but
not all current schema forms; the authorized JSON-text adapter avoids restricting
canonical tool/domain contracts. Provider-native tool calling remains a possible
future alternative requiring explicit justification, not a ModelProvider expansion.

## V0.3-003 approved loop policy

AgentRunner defaults to six iterations and a single 60000 ms whole-run deadline,
both configurable at construction. One iteration is one validated decision and at
most one ToolExecutor call plus observation. Finish returns immediately; exhaustion
yields safe LOOP_LIMIT without an extra model call. Caller AbortSignal is optional.
Cancellation/deadline stop waiting and future stages; existing model/tool interfaces
are unchanged and may leave in-flight work running. No hard cancellation is claimed.

Safe ToolExecutionError codes become observations and permit another decision within
remaining budgets. Agent-level decision/translation, canonical validation, internal,
limit, cancellation, or deadline failures terminate safely. Success observations
contain executor-validated JSON-compatible data. No automatic retry, duplicate-action
detection, forced final answer, planner, queue, persistence, memory, or framework.
ADR-008 defines return/error contracts and limits. V0.3-004 adds observability;
no HTTP or startup integration is added.

## V0.3-004 failure and observability decisions

Preserve existing safe AgentRunError categories and tool-failure continuation. Add
one terminal agent_run event using existing Nest logging/request context, with
decision/executor call counts, duration, outcome, and failure code. No sensitive
payloads, raw errors, goals, observations, tool names, or grants are logged. Logger
failure must not change run results; late work must not duplicate summaries. These
are local best-effort diagnostics, not durable audit storage or distributed tracing.
ADR-008 records the decisions; V0.3-005 adds deterministic evaluation.

## V0.3-005 authorized deterministic evaluation

Use reusable test-only scenarios with a fake ModelProvider and real decision service,
runner, executor and registry. Define exact expected results or terminal failures,
executor calls, ordered model-visible observations and decision counts. Every
scenario must pass; cover immediate finish, tool success, safe tool failure followed
by another decision, loop exhaustion and translation failure. Preserve all runtime
boundaries and policies. See [agent evaluation](../../concepts/agent-evaluation.md).
These checks establish scripted system/trajectory correctness, not live reasoning
quality. Live evaluation, statistical reliability, cost/latency benchmarking and
model comparisons are deferred. No new production behavior or dependency is added.
