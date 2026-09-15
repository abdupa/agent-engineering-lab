# v0.1 Mastery Record

This is a learning artifact for the Reliable LLM Foundation, not an application
usage guide or a certification of personal mastery. For each topic, explain the
question using the referenced source and a concrete request or failure example.
The release evidence is in [RELEASE.md](RELEASE.md).

## NestJS modules, controllers, and providers

**Meaning:** Modules compose dependencies; controllers adapt HTTP; providers supply
application behavior and integrations.
**Where:** [AppModule](../../../apps/api/src/app.module.ts),
[ResearchModule](../../../apps/api/src/research/research.module.ts), and
[ResearchController](../../../apps/api/src/research/research.controller.ts).
**Why:** Routing and construction stay separate from research planning and SDK work.
**Mastery question:** What changes in ResearchModule when a fake provider replaces
OpenAI, and why should ResearchController remain unchanged?

## Dependency injection

**Meaning:** Construction supplies a dependency instead of the consumer creating it.
**Where:** MODEL_PROVIDER in [model-provider.ts](../../../apps/api/src/ai/model-provider.ts)
and its useFactory binding in ResearchModule.
**Why:** The same application service works with a configured adapter or test fake.
**Mastery question:** Why is the exported symbol needed when ModelProvider already
exists as a TypeScript interface?

## Runtime versus compile-time validation

**Meaning:** TypeScript checks source types; runtime schemas inspect actual values
that may have come from untrusted external data.
**Where:** [research-plan.schema.ts](../../../apps/api/src/research/research-plan.schema.ts)
uses Zod and inferred types; the controller accepts body as unknown.
**Why:** A type assertion cannot reject malformed input or model output.
**Mastery question:** What would `data as ResearchPlan` fail to detect, and why must
the application use the parsed result after trimming and stripping?

## Structured outputs

**Meaning:** The model request supplies a JSON Schema to constrain response shape;
valid JSON alone is a weaker guarantee.
**Where:** zodTextFormat and text.format in
[OpenAIModelProvider](../../../apps/api/src/ai/openai-model-provider.ts).
**Why:** The application needs fields and types it can consume, with final Zod
validation still guarding the return boundary.
**Mastery question:** How can an upstream HTTP 200 still produce INVALID_OUTPUT,
and how can a schema-valid plan still be poor research?

## Provider abstraction

**Meaning:** An application-defined contract describes structured generation without
exposing vendor request/response types.
**Where:** ModelProvider.generateStructured accepts instructions, input, and a Zod
schema and returns its parsed type.
**Why:** Vendor mechanics and deterministic application tests remain separable.
**Mastery question:** Why is carrying Zod in this contract acceptable here, while
adding OpenAI response types or hypothetical provider-routing options is not?

## Dependency inversion

**Meaning:** The integration implements the application's contract; application
behavior does not depend on the concrete SDK adapter.
**Where:** [ResearchPlanService](../../../apps/api/src/research/research-plan.service.ts)
imports ModelProvider; OpenAIModelProvider implements it; ResearchModule binds them.
**Why:** Changing integration mechanics need not change the planning use case.
**Mastery question:** How do source dependency direction and runtime call direction
differ along the service-to-OpenAI path?

## Application versus infrastructure boundaries

**Meaning:** The application decides what work means; infrastructure handles the
external mechanism; transport adapts inputs and public outcomes.
**Where:** ResearchPlanService owns planning, OpenAIModelProvider owns SDK execution,
and ResearchController owns HTTP validation/error mapping.
**Why:** Each kind of change has a small, identifiable home.
**Mastery question:** Where should a planning instruction change, an SDK timeout
change, and a public HTTP error message change each be implemented?

## Prompt ownership

**Meaning:** Trusted planning instructions are application behavior, while user
objectives and constraints are separately serialized data.
**Where:** researchPlanningInstructions and JSON.stringify in ResearchPlanService.
**Why:** The generic adapter need not know research semantics, and user input is
not interpolated into trusted instructions.
**Mastery question:** Why does this separation clarify ownership without proving
that prompt injection is impossible?

## HTTP versus AI-output validation

**Meaning:** Incoming transport data and outgoing model data cross different trust
boundaries and obey different schemas.
**Where:** ResearchPlanRequestSchema in the controller and ResearchPlanSchema passed
to the adapter. The service does not reparse the returned plan.
**Why:** Invalid requests must stop before paid generation; invalid generated data
must stop before being returned as application data.
**Mastery question:** Why are these two validations necessary rather than redundant,
and what is the separate purpose of the smoke script's safeParse assertion?

## Retries, backoff, timeouts, and deadlines

**Meaning:** Retries repeat eligible failed attempts; backoff delays repetition;
an attempt timeout limits a transport attempt; an overall deadline limits caller
waiting across attempts and response consumption.
**Where:** OpenAIModelProvider uses two SDK retries, 10-second attempt timeout,
and a 30-second deadline after schema conversion; see
[ADR-003](../../adr/ADR-003-provider-reliability.md).
**Why:** Neither unlimited retries nor a per-attempt timeout alone bounds the whole
operation. The SDK already supplies retry selection and waiting.
**Mastery question:** What happens when Retry-After exceeds the overall deadline,
and why do abort and bounded attempts not guarantee exactly-once remote work?

## Provider-neutral errors

**Meaning:** A small fixed error vocabulary crosses the application boundary instead
of raw SDK errors, payloads, or causes.
**Where:** [model-provider.error.ts](../../../apps/api/src/ai/model-provider.error.ts),
adapter normalization, and controller HTTP mappings.
**Why:** HTTP behavior remains predictable and private upstream details stay private.
**Mastery question:** Why does an upstream 401 become a configuration failure with
generic HTTP 500 rather than an authentication challenge to the API caller?

## Observability and correlation

**Meaning:** Safe events describe execution; a request ID relates events without
passing diagnostic parameters through domain contracts.
**Where:** [request-context.ts](../../../apps/api/src/observability/request-context.ts),
[http-observability.ts](../../../apps/api/src/observability/http-observability.ts),
and [openai-observability.ts](../../../apps/api/src/ai/openai-observability.ts).
**Why:** Operators can distinguish transport success from validated output and
follow concurrent requests without logging input, output, or credentials.
**Mastery question:** Why are there separate request and generation contexts, and
why can attempt duration and total execution duration legitimately differ?

## Deterministic automated testing

**Meaning:** Repeatable tests control inputs, responses, failures, and time rather
than relying on live model behavior.
**Where:** Six suites under apps/api/src and
[health.integration.spec.ts](../../../apps/api/test/health.integration.spec.ts).
Adapter tests use real SDK behavior with fake fetch and virtual timers; HTTP tests
use localhost with provider overrides.
**Why:** The 124 tests exercise validation, composition, reliability, privacy, and
correlation without cost, credentials, or external AI availability.
**Mastery question:** What does a real-SDK/fake-transport test establish that a
service fake does not, and what can neither establish about a live model?

## Manual live integration testing

**Meaning:** A deliberately invoked smoke request checks actual provider/model
compatibility separately from normal automated tests.
**Where:** [live-openai-smoke.ts](../../../apps/api/scripts/live-openai-smoke.ts),
run with pnpm smoke:openai. Recorded evidence: gpt-5.6-luna, upstream HTTP 200,
first attempt, ResearchPlanSchema validated, correlation confirmed.
**Why:** Local schema conversion and fake transport cannot prove live acceptance.
**Mastery question:** Why does this success not establish normal research prompt
quality, full live HTTP behavior, or retry recovery under real failures?

## Self-review

Trace one valid request, one invalid HTTP request, one invalid model output, and
one deadline expiry. Explain which boundary makes each decision and what may be
logged. Use the test suite and [architecture review](REVIEW.md) to check your
answers. These exercises are proposed learning work, not completed learner results.
