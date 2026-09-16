# Current work

Project: Agent Engineering Lab

Release: v0.6 — First agent: read-only codebase auditor

Current task: V0.6-003a — Token and cost instrumentation

Status: Completed

## Delivered

`POST /audit` runs the agent over a configured directory and returns findings. `AppModule`
now mounts `AuditModule` alongside `ResearchModule`.

**The wiring debt is paid.** Since v0.2 the tool system, agent loop, orchestration and
retrieval have existed as library code composed only inside test files. A request now
enters over HTTP, reaches a real agent loop, drives real tools against a real filesystem,
and returns validated findings.

## The request carries no path

`AUDIT_ROOT` is configuration. The request body is `{ rubric?: string }` and nothing else.
There is no transport surface that could point the audit somewhere else — extra fields
like `path` or `target` are ignored, which is tested.

This costs something honest: one deployment audits one directory. That is the smallest
design that satisfies the requirement, and widening it later means widening confinement
deliberately rather than discovering it was never there.

`AUDIT_ROOT` is required and resolved at startup, so a missing or non-existent root fails
before the application listens — the same treatment `OPENAI_API_KEY` already receives.

## Partial results are results

A run that fails after recording findings returns **200** with `status: "incomplete"` and
the reason. A run that fails having recorded nothing maps by cause: 502 for a failed or
invalid decision, 504 for timeout, 503 for cancellation, 500 for internal.

The exception is `LOOP_LIMIT`, which returns 200 incomplete even with no findings. The
agent ran correctly and spent its budget; that is an outcome, not a server error.

## Verification

**565 passed, 29 suites** — up from 552. Format, lint, typecheck, build and diff clean.

Thirteen HTTP integration tests over a localhost socket, including: a complete report;
invalid bodies rejected with 400; partial findings returned as 200 incomplete; an empty
failure mapped to 502; the workspace root and raw error text proven absent from failure
responses; correlation ids on both success and failure paths; and the research and health
endpoints proven still working alongside the new one.

The suite was re-run with `.env` removed and the variables unset, to confirm it behaves in
CI as it does locally. 565 pass either way.

## Autonomous decisions

**L2 — partial-result HTTP semantics.** Alternatives were 206 Partial Content, or mapping
every failure to an error status. 206 is poorly supported by clients for this shape, and
discarding recorded findings behind a 5xx throws away real work. Chosen: 200 with an
explicit `status` and `reason` when work exists, error statuses only when nothing does.

**L2 — audited root as configuration, not request input.** The alternative was a
request-supplied path confined to a configured base. Rejected for v0.6: it adds a
transport-level attack surface for no requirement that exists yet.

**L1** — separate `audit.tokens.ts` so tests can override the workspace without importing
the module graph; response shape flattened rather than nesting the report.

## Correction made during the work

`health.integration.spec.ts` began failing once `AppModule` mounted `AuditModule`, because
its startup workspace had no override. Fixed by overriding `AUDIT_WORKSPACE` the same way
that test already overrides `MODEL_PROVIDER`, rather than by weakening the startup
requirement to make the test pass.

## Ready to run: the live probe

`pnpm probe:agent` is written and waiting for a key. It is manual only — never runs in
tests, startup or CI — and makes **at most three billable requests**.

Two stages, cheapest risk first:

1. **Schema probe, one request.** Does the live Structured Outputs API accept
   `AgentDecisionTransportSchema`? That schema was designed for compatibility in v0.3-002
   and has only ever been checked against an offline conversion test. It has never met a
   real provider. If this fails, nothing after it matters.
2. **Two-step audit, at most two requests**, against a temporary two-file fixture the
   script creates and deletes. It deliberately does **not** read `AUDIT_ROOT`, so a probe
   cannot wander into a real codebase.

The fixture is built so its answer is checkable by hand: `parse.ts` calls `JSON.parse` on
untrusted input with no validation, and its README claims the opposite. A useful run finds
one or both. A run that reports findings without reading the files is the failure worth
catching.

## Next

**V0.6-004 — run the probe, then a capped audit of this repository, and record the
result.** What it found, what it missed, what it invented. That record becomes the seed
of the v1.0 evaluation set.

This is the first milestone requiring a live model and real spend.

## Known gap the probe will make concrete

`AgentState.observations` accumulates every tool result, and the decision service
serialises the whole state on every call. There is no truncation or windowing. On this
repository the files are small enough that it should not matter; on a large codebase it is
a wall. The probe is capped at two iterations partly to keep that bounded, and what a real
run does with the tools is the evidence that would earn a memory or planning release.

**Spend is now instrumented** (added before running anything, so the first live run
reports its own cost rather than sending you to a dashboard). Every generation logs
`inputTokens` and `outputTokens` on `provider_execution`, summed across SDK retries;
`POST /audit` returns a `usage` block; and the probe prints per-stage and combined totals.

Cost is reported **only when rates are supplied** via `OPENAI_INPUT_COST_PER_MTOK` and
`OPENAI_OUTPUT_COST_PER_MTOK`. Hardcoding a pricing table would go stale silently and
report a confident wrong number, which is the failure mode this repository exists to
avoid. Unset, the output says "cost unavailable" rather than printing a zero.

## Limitations

No live run has happened yet; every trajectory so far is scripted. Evidence is quoted text
and nothing checks the claim follows from it. One deployment audits one directory. Cost and
latency are unmeasured. `run_tests` remains deferred as L3.
