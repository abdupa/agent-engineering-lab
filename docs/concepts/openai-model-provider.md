# OpenAI model provider

[OpenAIModelProvider](../../apps/api/src/ai/openai-model-provider.ts) implements
the existing `ModelProvider` contract. It owns SDK calls, model configuration,
schema conversion, response checks, and JSON decoding. Application code continues
to depend on the provider-neutral request and result types; the implementation
imports no research contracts.

```text
OpenAIModelProvider
        |
        v
Responses API
        |
        v
Structured Outputs
        |
        v
Zod validation
```

## Generation and validation

The official `openai@7.12.1` SDK's `zodTextFormat` helper converts the supplied Zod
4 schema to strict JSON Schema in `text.format`. The provider passes instructions,
input, and the configured model to `client.responses.create()`. This is JSON
Schema Structured Outputs, not JSON-only mode. See the official
[Structured Outputs guide](https://developers.openai.com/api/docs/guides/structured-outputs).

The provider requires a completed response, rejects refusals and empty output,
and reads the SDK's `output_text` accessor rather than assuming an array position.
It decodes that text as unknown JSON and returns `request.schema.parse(data)`.
Using `create()` avoids automatic schema parsing followed by a second application
parse. Zod validation runs once and returns the parsed output, including trimming
and removal of unknown fields.

Provider-side constraints guide generation; application-side validation enforces
the caller's actual rules before data crosses the boundary. Malformed JSON and
schema violations reject the promise. V0.1-007 normalizes failures to safe provider-neutral categories; see
[provider reliability](provider-reliability.md).

Schemas must be convertible by the SDK helper and fit the API's supported JSON
Schema subset. Arbitrary Zod types or transformations are not universally
representable; unsupported conversions fail before a request. The neutral
interface remains unchanged. Model/schema compatibility still needs validation
when a real model is selected.

## Construction and request settings

Construct the provider with an official `OpenAI` client and a non-empty model name:
`new OpenAIModelProvider(client, model)`. The caller owns credential loading and
client construction. `OPENAI_API_KEY` and `OPENAI_MODEL` are documented as blank
placeholders in `.env.example`; ResearchModule now requires and reads both through
ConfigService when constructing the production binding.
There is no hard-coded production model or key.

Each call explicitly sets `store: false` because this capability does not need
responses stored for later retrieval. This is a response-storage choice, not a
claim of zero retention across all OpenAI data controls. See OpenAI's
[data controls](https://developers.openai.com/api/docs/guides/your-data).

V0.1-007 sets two SDK retries maximum, a 10-second attempt timeout, and a
30-second overall deadline with request cancellation. Production SDK logging is
disabled; the controller emits only safe failure categories.

ResearchModule registers this class through `MODEL_PROVIDER` without a separate
AI module. Application startup now requires provider configuration. See the
[HTTP slice](research-http-slice.md) for composition and validation details.

## Tests and deferred work

Tests instantiate the real SDK with a fake `fetch` transport. They exercise schema
conversion, request serialization, and the SDK text accessor without external
calls or credentials. A small test-only schema verifies generic behavior and
final validation. Cases cover invalid data, malformed JSON, missing output,
refusal, non-completed responses, bounded SDK retries and timeout failures, unsupported schema
conversion, and an empty model name.

V0.1-005 adds [ResearchPlanService](application-ai-boundary.md) as an application
consumer, and V0.1-006 adds HTTP and production wiring. A [manual live smoke command](live-openai-verification.md) is available; live
verification succeeded with `gpt-5.6-luna` and ResearchPlanSchema in V0.1-009. V0.1-007 adds bounded execution,
normalized errors, and minimal safe diagnostics. Broader telemetry remains deferred.

V0.1-008 adds [structured observability](structured-observability.md). ResearchModule
wraps the SDK fetch transport to observe attempts without changing retry behavior.
The adapter captures request context and emits a final validation-aware summary;
SDK diagnostics remain disabled.
