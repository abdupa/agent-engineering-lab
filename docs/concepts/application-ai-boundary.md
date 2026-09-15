# Application AI boundary

[ResearchPlanService](../../apps/api/src/research/research-plan.service.ts) is the
application use case for turning a research objective into a `ResearchPlan`. Its
`generatePlan(input)` method accepts this transport-independent TypeScript contract:

```ts
interface ResearchPlanInput {
  objective: string;
  constraints?: string[];
}
```

The service makes one structured-generation request and returns the provider's
validated plan unchanged. Provider failures propagate without catching, retrying,
or mapping them. Direct callers are responsible for supplying valid typed input;
this task introduces no HTTP DTOs or duplicate input-validation schema.

```text
Research objective
       |
       v
ResearchPlanService
       |
       v
ModelProvider
       |
       v
Concrete provider
       |
       v
External model
```

The service sees only `ModelProvider`. It imports no SDK, concrete provider, model
name, or API-key configuration. Dependency inversion now has a concrete use case:
research behavior asks for structured generation through an application contract,
and a concrete provider fulfills that contract. Tests can supply a fake provider
without any vendor integration.

## Instruction ownership and user input

Research-specific instructions live as a deterministic constant beside the
service. They ask for planning rather than answering the objective, including
questions and rationales, explicit assumptions, evidence topics and reasons, and
unknowns. This is application behavior: changing a research plan's intent should
not require changing the generic OpenAI integration. OpenAIModelProvider owns
execution and validation mechanics, not research prompts.

The service sends trusted instructions in `instructions` and JSON-serializes only
`objective` and `constraints` into `input`. Omitted constraints remain omitted;
explicit empty arrays remain empty. User text is preserved and never interpolated
into trusted instructions. This makes the boundary explicit, but does not prove
immunity to prompt injection. Comprehensive guardrails remain deferred.

## Schema and dependency injection

The service passes the existing `ResearchPlanSchema` by reference so the provider
has the runtime rules needed to return validated data. It does not copy those
rules or parse the returned plan again. The schema remains the source of truth
for the inferred `ResearchPlan` type. Structural validity does not establish
factual accuracy or the quality of the generated plan.

`@Injectable()` and `@Inject(MODEL_PROVIDER)` make the service compatible with
NestJS. The constructor parameter is typed as `ModelProvider`; the symbol supplies
its runtime identity. Unit tests verify injection with a test-only `useValue`
binding and also construct the service directly with a fake provider.

V0.1-006 adds [HTTP validation and production wiring](research-http-slice.md)
around this service without changing its provider-neutral contract. V0.1-007 adds
[provider reliability and HTTP error mapping](provider-reliability.md); this
service still has no retry or error-mapping logic. Live evaluation remains deferred.
