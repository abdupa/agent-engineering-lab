# Manual live OpenAI verification

Run from the repository root:

```sh
pnpm smoke:openai
```

Set non-blank `OPENAI_API_KEY` and `OPENAI_MODEL` in `apps/api/.env` or the
environment first. Environment values take precedence. There is no default model;
choose one supporting Structured Outputs. Missing settings produce a safe
`live_smoke_blocked` event naming only missing variables and exit status 1.
An explicit `OPENAI_BASE_URL` must target `https://api.openai.com/v1` so a
successful verification cannot silently describe another server.

The script creates the production Nest application context and resolves
`MODEL_PROVIDER`, without starting an HTTP listener. It supplies a generated
request ID to the existing context and requests a minimal ResearchPlan with empty
collections. Using the actual ResearchPlanSchema verifies its schema conversion
and live API acceptance rather than only a substitute test schema. This is a
short verification request, not research; cost depends on the configured model.

There is one logical generation. Existing SDK policy permits up to three transport
attempts, with a 10-second attempt timeout and 30-second overall deadline.
`store: false`, normalized errors, and correlated attempt/execution logs remain
unchanged. The returned value is explicitly checked against ResearchPlanSchema;
no output, prompt, credentials, validation issues, or raw errors are printed.
The application context closes after generation.

Success is exit status 0 with `live_smoke_succeeded`, `validated: true`, model,
provider, schema name, and request ID. Failure is nonzero with a safe category or
preflight reason. Existing provider logs supply timings, attempts, and outcomes.
The script is typechecked and linted but excluded from the production build and
Jest roots. No startup, normal test, or CI validation command invokes it.

## SDK compatibility decision

Inspected installed `openai@7.12.1` helper and Responses parser sources, with
`zod@4.5.4`. The helper supports Zod 4; offline conversion of ResearchPlanSchema
produced strict JSON Schema successfully. The SDK supports both `responses.create()`
with manual parsing and `responses.parse()` with `output_parsed`. The latter is
also shown in the official
[Structured Outputs guide](https://developers.openai.com/api/docs/guides/structured-outputs).

The existing provider already checks completion/refusal, decodes `output_text`,
and applies the caller's Zod schema once before returning. Switching to automatic
parsing does not establish a correctness improvement here and could duplicate
parsing or affect error handling. No provider change was made; ADR-002/003/004
and domain contracts remain unchanged.

## Execution status and limits

On 2026-09-12 the manual command was invoked once and stopped before transport:
both `OPENAI_API_KEY` and `OPENAI_MODEL` were absent from the process environment
and API `.env`. The user subsequently supplied successful live command output:
model `gpt-5.6-luna`, HTTP 200 on attempt 1, approximately 3069 ms to response
headers and 3508 ms overall. `provider_attempt`, `provider_execution` (success),
and `live_smoke_succeeded` (`ResearchPlanSchema`, `validated: true`) shared request
ID `00c60548-f45d-46f0-817d-e161e5c416b9`. This user-run result completes V0.1-009;
no additional paid request was made to record it. All 124 automated tests remain
deterministic and network-free.

This successful run establishes live acceptance and validation for that configured
model at that time. It does not prove research quality, generated nested-item
quality, HTTP behavior, or retry recovery under live failures. Those reliability
and HTTP paths retain deterministic coverage; this command does not deliberately
induce paid failures or add new AI capabilities.
