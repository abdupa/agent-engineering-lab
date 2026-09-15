# Research planning HTTP slice

V0.1-006 connects the existing application service and model provider to
`POST /research/plan`. Success returns HTTP 200 with a ResearchPlan.

```text
HTTP
 |
 v
Controller
 |
 v
ResearchPlanService
 |
 v
ModelProvider
 |
 v
OpenAIModelProvider
 |
 v
OpenAI
 |
 v
ResearchPlanSchema
```

## Responsibilities

`ResearchController` validates the unknown request body using a separate Zod
transport schema. The objective is required and must be a non-blank string.
Constraints are optional; when present they must be an array of non-blank strings.
Strings are trimmed, empty arrays are accepted, and unknown object keys are
stripped. Invalid input returns HTTP 400 before any model call. The controller
maps parsed fields into `ResearchPlanInput`.

`ResearchPlanService` owns the research-planning instructions, serializes user
input separately, and supplies the existing ResearchPlanSchema to ModelProvider.
It sees only the application contract, not the SDK or model configuration.

`OpenAIModelProvider` owns the external request and response handling. After
structured generation, it decodes the response and validates it with the supplied
ResearchPlanSchema before returning it. HTTP input validation and AI-output
validation are separate boundaries with different schemas and responsibilities.

## Composition and startup

AppModule imports ResearchModule, which composes the controller, application
service, and MODEL_PROVIDER binding. A small inline NestJS `useFactory` binding
receives ConfigService, checks `OPENAI_API_KEY` and `OPENAI_MODEL`, constructs the
SDK client, and returns OpenAIModelProvider. This is composition code, not a
provider-factory class or routing abstraction.

Both settings must be explicitly supplied as non-empty strings. Whitespace is
trimmed. Missing, blank, or incorrectly typed settings fail application startup
with an error naming the setting, never its value. There is no default key or
model. These checks belong to the provider binding: overriding MODEL_PROVIDER in
tests avoids constructing the real provider and does not require credentials.
Configuration presence is checked locally; startup does not verify credentials
or model availability with OpenAI.

The existing `.env` loading and HTTP environment defaults remain unchanged.
`GET /health` still returns `{ "status": "ok" }` without calling a provider;
the running application now requires provider configuration even for health.

## Errors, testing, and limits

V0.1-007 maps provider-neutral failures to fixed public errors and logs only
safe categories. Unknown/configuration failures remain generic HTTP 500. See
[provider reliability](provider-reliability.md) for the status table and limits.

HTTP integration tests use the real AppModule, controller, and application
service while overriding MODEL_PROVIDER with a deterministic fake. Composition
unit tests cover missing configuration and successful construction without an
external call. Normal tests never contact OpenAI and need no real API key.

[Live smoke verification](live-openai-verification.md) succeeded in V0.1-009.
Output-quality evaluation remains deferred. Provider health checks, persistence, streaming, and additional endpoints remain
out of scope. Retry and timeout policy are now defined by V0.1-007.
