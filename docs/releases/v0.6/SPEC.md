# v0.6 — First agent: read-only codebase auditor

Status: In progress. V0.6-001 active.

## The product requirement that earns this release

An auditor needs findings on a codebase without reading every file by hand. Given a
repository, produce a list of concrete findings — each naming a file, a line, a claim,
and the evidence for it — so the reviewer can confirm or dismiss each one in seconds
instead of rediscovering it themselves.

The first audit target is this repository, where the reviewer already knows the answers
and can therefore judge the output immediately.

## Goal

Make the existing pieces do real work. v0.2's tool system and v0.3's agent loop have
never run against anything; this release gives them a reason to and an endpoint to run
behind.

Advances catalogue pattern **#1 Autonomous Decision-Making** and **#10 Tool-Using** from
"implemented and tested" to "doing a real task".

## Architecture direction

```text
POST /audit  { target, rubric? }
  -> AuditController          transport validation
  -> AuditService             owns audit instructions, projects findings
  -> AgentRunner              existing bounded loop
       -> AgentDecisionService -> ModelProvider
       -> ToolExecutor         -> audit tools
  -> Finding[]                validated before return
```

No new agent machinery. The audit tools are ordinary `Tool` implementations registered
in the existing `ToolRegistry` and invoked only through `ToolExecutor`.

## Preserved boundaries

- `ToolRegistry` discovers; it never executes.
- `ToolExecutor` remains the only invocation path. Permission check precedes input
  parsing, which precedes the handler.
- `AgentState` remains goal plus executor-validated observations.
- `ModelProvider` stays generation-only. No tool reaches a provider.
- Tools receive parsed input and an `AbortSignal`, nothing else. No handler, client,
  credential or filesystem root escapes into model-visible state.

## Required distinctions

- **Model-proposed path != permitted path.** The model names a file; deterministic code
  decides whether that file may be read. This is the release's central boundary.
- **Inside the root != safe to read.** `.env` sits inside the workspace and must never
  be returned.
- **Finding != defect.** A finding is a claim with evidence attached. Confirming it is
  the reviewer's job, and v0.6 has no verification layer.
- **Evidence != support.** A quoted line proves the line exists, not that the claim
  about it is true. That gap is v1.1.

## Reliability policy

- **Failure modes.** Missing path, unreadable path, path outside the workspace, excluded
  path, binary or oversized file, empty result, no matches. Each returns a normalized
  `ToolExecutionError`; none returns a partial or invented result.
- **Retryable vs terminal.** Nothing here is retried. Filesystem errors are deterministic
  and repeating them changes nothing. Tool failures become agent observations, so the
  model may choose a different action — that is a new decision, not a retry.
- **Deadline.** The existing 5000 ms `ToolExecutor` deadline applies unchanged. It bounds
  how long the caller waits; it does not guarantee a filesystem call has stopped.
- **Side effects.** None. Every tool in this milestone is read-only. Writing files and
  running commands are deliberately excluded — see deferred work below.
- **Fail closed.** Any path that cannot be proven to resolve inside the workspace root is
  rejected. Ambiguity is denial, never permission.
- **No model-supplied regular expressions.** `grep` matches literal substrings only. A
  catastrophic backtracking pattern blocks the event loop synchronously, and the
  executor's deadline is a promise race that cannot fire while the loop is blocked — so
  the existing timeout would not protect against it. Literal matching removes the class.

## Observability

- **Emits on success.** The existing `tool_execution` event covers every call: tool name,
  duration, outcome, correlation id. No new event is added for tools.
- **Emits on failure.** Same event with the normalized failure code.
- **Never emitted.** File contents, file paths, match text, the workspace root, search
  patterns, or any part of the target codebase. A path is user data and may itself be
  sensitive; the existing event deliberately carries none of it.
- **Correlation.** Unchanged. `correlationFields()` flows from the HTTP request through
  the agent run into each tool execution.
- **Acceptance test.** Given only the logs, an operator can tell which tool failed, with
  which normalized code, in which run. They cannot tell which file was involved — that is
  intentional, and it is the limit to state rather than fix.

## Security

The tools trust nothing from the model. Every path is treated as hostile input:
resolved against a configured absolute root, rejected if absolute, rejected if it escapes
via `..`, and rejected if its real path — after symlink resolution — falls outside the
root. Files matching the exclusion list are refused even when they resolve inside it.

Authority held: read access to one configured directory, and nothing else. The tool could
be asked to read a secret; the exclusion list and the root confinement are what stop it.
Neither is a substitute for not putting secrets in the workspace.

## Milestones

| Task     | Objective and required outcome                                                           | Evidence / exit criteria                                                                                      |
| -------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| V0.6-001 | Workspace confinement and three read-only audit tools: `list_files`, `read_file`, `grep` | Escape attempts rejected (absolute, `..`, symlink, excluded); limits enforced; tools run through ToolExecutor |
| V0.6-002 | Finding contract and audit service with the agent loop                                   | Findings validated; fake-provider trajectory tests; no live call required                                     |
| V0.6-003 | `POST /audit` HTTP slice                                                                 | Transport validation, safe error mapping, integration tests over a localhost socket                           |
| V0.6-004 | Run it against this repository and record the result                                     | A recorded run: what it found, what it missed, what it invented. Becomes the v1.0 evaluation seed.            |

## Evaluation

Measurable in V0.6-004: did the agent find defects the reviewer already knows about in
this repository? A regression would be a previously found defect no longer surfacing, or
a finding whose cited evidence does not exist.

No threshold is set in v0.6. Ten scored runs are not a benchmark, and one reviewer's
judgement is not ground truth — that is what v1.0 is for.

## Non-goals

No writes, no command execution, no memory across runs, no planning, no async execution,
no approval gates, no verification of claims, no persistence, no deployment, no console.
No new dependency. No second agent.

## Deferred work and why

**`run_tests` is not in V0.6-001.** Spawning a process is a new trust boundary, not a new
tool, and `DECISION_POLICY` classifies that as L3. It is deferred until the guardrails
release establishes an approval boundary for consequential actions.

This is the decision policy firing on the first milestone of the first release, exactly
where the roadmap predicted it would.

## What this will not prove

Passing tests here establish that path confinement rejects the escapes that were tested,
that limits are enforced, and that the agent can complete a trajectory using real tools.

They do not establish that the exclusion list is complete, that no unexplored escape
exists, that findings are correct or useful, that the model chooses good tools, or that
any of it works against a codebase larger than the fixtures. Confinement is tested
against known attacks, which is not the same as proven safe. A finding is a claim with a
quotation attached — v0.6 contains nothing that checks whether the claim follows from the
quotation.
