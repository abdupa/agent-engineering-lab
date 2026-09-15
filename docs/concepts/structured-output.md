# Structured output

In this Laboratory, structured output means data with a defined shape that
application code can consume: a research objective, questions with rationales,
assumptions, required evidence, and unknowns. Valid JSON alone does not guarantee
that shape or the correct field types.

TypeScript types check code at compile time and are erased at runtime. An API
response or future model response can still contain missing fields or wrong types.
A type assertion such as `data as ResearchPlan` does not validate data. Treat
external data as `unknown` until it passes runtime validation at the boundary.

## The implemented contract

[research-plan.schema.ts](../../apps/api/src/research/research-plan.schema.ts)
exports three runtime Zod schemas: `ResearchQuestionSchema`,
`RequiredEvidenceSchema`, and `ResearchPlanSchema`. Each corresponding TypeScript
type is derived with `z.infer<typeof Schema>`, keeping compile-time types aligned
with runtime rules without duplicate interfaces.

All fields are required. Strings are trimmed and must contain at least one
remaining character, including string items in assumptions and unknowns. Arrays
must be arrays, and nested objects must satisfy their schemas. Empty arrays are
allowed. There are no ID format, uniqueness, maximum length, or minimum item-count
rules. Unknown object keys are stripped from parsed output at each object level.
Always use the parsed output rather than the original input.

Zod's `ResearchPlanSchema.parse(data)` returns validated data or throws a Zod error.
`ResearchPlanSchema.safeParse(data)` returns a success result containing `data`, or
a failure containing validation issues and their field paths. Neither method calls
an LLM or any external service. See the [Zod API documentation](https://zod.dev/api).

## Integration boundary

The validation flow below now runs inside the wired provider:

```text
LLM / external data
        |
        v
     unknown
        |
        v
 ResearchPlanSchema
        |
    +---+---+
    |       |
 valid    invalid
    |       |
    v       v
ResearchPlan reject
```

The provider validates decoded external data before application/domain
code consumes it, respecting the provider boundary in
[ADR-002](../adr/ADR-002-model-provider-abstraction.md). This task implements only
schemas, inferred types, and deterministic unit tests. V0.1-003 adds the
[model provider contract](model-provider-boundary.md), and V0.1-004 adds
[OpenAI provider execution](openai-model-provider.md) with response decoding and
final Zod validation. V0.1-005 adds
[ResearchPlanService](application-ai-boundary.md), which supplies this schema to
the provider. V0.1-006 adds the [HTTP slice](research-http-slice.md).

Passing validation establishes structure, not factual accuracy, evidence quality,
or whether a plan meets the user's objective; those require later evaluation.
