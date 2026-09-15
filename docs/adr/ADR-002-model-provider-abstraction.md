# ADR-002 — AI Model Provider Abstraction

Status: Accepted

Date: 2026-09-06

## Context

The future research-planning capability needs model-generated output without
coupling application behavior and tests to a provider SDK. This ADR records a
future boundary required by the project, not an implementation for V0.1-001.

## Decision

Application/domain services must not directly depend on a concrete AI provider
SDK when an application-level provider interface is appropriate.

Future conceptual dependency:

```text
ResearchPlanService
        |
        v
ModelProvider
        |
        +-- OpenAIModelProvider
```

Keep provider implementation details behind the application interface. Define the
interface from actual application requirements when the relevant task begins.
Later providers may be introduced if justified.

### V0.1-003 contract details

The boundary is now defined in `apps/api/src/ai/model-provider.ts` as
`generateStructured<T>(request: StructuredGenerationRequest<T>): Promise<T>`.
The request contains `instructions`, `input`, and `schema: ZodType<T>` using the
existing Zod dependency. Implementations must validate external data with that
schema and return its parsed output. The contract imports no research types or
provider SDK concepts.

An exported `MODEL_PROVIDER` symbol provides a runtime NestJS injection token
because the TypeScript interface is erased during compilation. This keeps the
contract small without adding an abstract class or a second schema abstraction.
No concrete provider, registration, or AI module is introduced in V0.1-003.

### V0.1-004 execution details

OpenAIModelProvider receives an official SDK client and a model name through its
constructor. It uses the Responses API with the SDK's Zod 4 JSON Schema helper,
then decodes response text and performs final validation using the caller's Zod
schema. SDK types and response handling stay inside the concrete implementation;
the application contract is unchanged. No NestJS registration is needed until a
consumer exists. V0.1-004 disabled response storage and SDK retries. V0.1-007 retains the
storage choice and adds the bounded reliability policy in
[ADR-003](ADR-003-provider-reliability.md).

### V0.1-006 composition details

ResearchModule is the composition boundary that binds MODEL_PROVIDER to
OpenAIModelProvider using ConfigService. Provider configuration is required when
that binding is constructed, allowing HTTP tests to override it without real
credentials. The controller and application service retain their provider-neutral
dependencies. No separate provider factory or routing module is needed.

## Alternatives considered

- Direct SDK calls in application services: fewer initial files, but couples
  application behavior, provider errors, and tests to one vendor.
- A broad multi-provider framework now: introduces speculative complexity before
  the application's requirements and contracts exist.

## Consequences

The future boundary supports deterministic test doubles and isolates vendor
integration changes. It adds a small adapter cost when implemented. It does not
remove the need to validate AI-generated structured data at runtime.

Do **not** implement ModelProvider, ResearchPlanService, OpenAIModelProvider, or
install provider SDKs during V0.1-001.
