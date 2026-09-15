# Model provider boundary

[ModelProvider](../../apps/api/src/ai/model-provider.ts) is the application's
contract for requesting structured generation. It accepts instructions, input,
and a runtime Zod schema, and promises the schema's validated output type:

```ts
interface StructuredGenerationRequest<T> {
  instructions: string;
  input: string;
  schema: ZodType<T>;
}

interface ModelProvider {
  generateStructured<T>(request: StructuredGenerationRequest<T>): Promise<T>;
}
```

Application/domain code should depend on this contract so that SDK request types,
vendor choices, and integration changes stay inside a concrete provider. In plain
language, dependency inversion means the application defines what it needs and
the integration adapts to that contract.

```text
Research/Application
        |
        v
   ModelProvider
        |
        v
Concrete Provider
        |
        v
External Model
```

V0.1-003 implements only the first boundary's contract. V0.1-004 adds an
[OpenAI implementation](openai-model-provider.md). V0.1-005 adds
[ResearchPlanService](application-ai-boundary.md) as the first application consumer;
V0.1-006 adds [production wiring and HTTP](research-http-slice.md).

## Runtime injection token

TypeScript interfaces disappear when compiled to JavaScript. NestJS therefore
cannot use the `ModelProvider` interface itself to look up a dependency at runtime.
The same file exports `MODEL_PROVIDER = Symbol('MODEL_PROVIDER')` as its explicit
runtime injection token. Future NestJS consumers can use `@Inject(MODEL_PROVIDER)`
while typing their dependency as `ModelProvider`; a future registration must use
that same exported symbol. Creating another symbol with the same description
would create a different token.

ResearchModule now registers the concrete provider under this symbol. No separate
AI module is needed.

## Runtime schema boundary

The request carries `schema: ZodType<T>` from the existing Zod dependency. `T`
describes the parsed output, while the runtime schema supplies the actual rules
needed to validate external data. A future implementation must treat decoded
model output as unknown, validate it with the supplied schema, and return the
parsed result, including any transformations. Invalid output must not be returned
as `T`. A type assertion alone cannot fulfill this contract.

```text
instructions + input + schema
              |
              v
        ModelProvider
              |
              v
     external AI response
              |
              v
       runtime schema
              |
              v
         validated T
```

The interface expresses this obligation; it cannot enforce validation at runtime
by itself. V0.1-004 implements and tests this obligation in OpenAIModelProvider.

The provider stays domain agnostic: callers supply their schemas, and the provider
does not import research types or know their fields. See
[structured output](structured-output.md) for the existing research schemas and
the distinction between structural validation and factual accuracy.

## Deferred work

V0.1-007 adds [bounded execution and normalized errors](provider-reliability.md).
Broader telemetry, streaming, tool calling, chat history, routing, usage
accounting, and other capabilities without a current requirement remain deferred.
V0.1-003 added
no dependencies or network calls; V0.1-004 adds the SDK and provider execution.
