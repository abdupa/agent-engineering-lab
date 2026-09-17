# ADR-017 — Typed tool arguments alongside the JSON-string transport

Status: Accepted. Typed transport implemented and off by default, pending live
acceptance of the schema shape.

## Context

[ADR-007](ADR-007-agent-domain-contracts.md) keeps the canonical `AgentDecision` as a
JSON object. v0.3-002 could not ask the provider for that shape directly: strict
Structured Outputs would not accept an arbitrary object map, so the model-facing
transport carried tool arguments as `argumentsJson`, a string holding JSON.

The model has to escape that string by hand. Two live runs showed it cannot do so
reliably:

|                      | Run 5                           | Run 6              |
| -------------------- | ------------------------------- | ------------------ |
| Payload              | 978 chars, contains source code | 204 chars, no code |
| Ends in `}`          | yes                             | yes                |
| Quotes / backslashes | 68 / 46                         | 36 / 8             |
| Result               | unparseable                     | unparseable        |

A correct short payload needs roughly 28 quotes and 14 backslashes. Run 6 produced 36
and 8 — inner quotes written raw where escapes were required. Removing source code from
findings (evidence is now cited by line and read from the file) shrank the payload by
79% and did not help, which is what established that the string itself is the defect
rather than its contents.

The failure reaches the application as `INVALID_OUTPUT` from `JSON.parse`, before any
schema runs, so no amount of schema strictness can catch it.

## Decision

Add a second model-facing transport in which each tool's arguments are a typed object,
built from the tools supplied to the decision:

```text
decision: discriminated union on toolName
  { toolName: "finish",         result: string }
  { toolName: "<tool>",         arguments: <that tool's input schema> }
```

`translateTypedDecision` produces exactly the same canonical `AgentDecision`. Nothing
downstream changes: `AgentRunner`, `ToolExecutor`, `AgentState` and the observation
contract are untouched, and both transports are proven in tests to yield identical
decisions for the same logical choice.

The transport is selected by `AgentDecisionOptions.typedArguments`, wired to
`AGENT_TYPED_ARGUMENTS`, and **defaults to off**. It falls back to the string transport
whenever any tool lacks an input schema.

Tool schemas travel with the descriptions but are never serialized into the model input;
only name and description are, as before.

## Why not the alternatives

**Retry on unparseable output.** v0.1 deliberately does not retry invalid output, and a
retry treats a systematic encoding failure as a transient one. It also costs a full extra
generation each time.

**Prompt the model to escape more carefully.** Run 6 already failed on a 204-character
payload. The instruction cannot make the task reliable; the task should not exist.

**Flat nullable argument slots per tool.** Also converts, but produces more `anyOf`
branches and a shape that scales badly as tools are added.

## Guarantees and limitations

Offline checks, all in `typed-arguments.spec.ts`: the schema converts through the
installed helper, reports `strict: true`, contains no object permitting extra properties
and no optional property, refuses to build unless every tool supplies a schema, and
refuses a tool named `finish`. The observed run-6 failure is reproduced against the string
transport and shown to be unconstructible in the typed one.

**Conversion is not acceptance.** Strict Structured Outputs enforces server-side rules
this repository cannot check, so the typed transport stays off until one live call
confirms the API accepts the shape. That probe has not been run.

One constraint was found this way rather than in production: `report-finding` used
`.optional()` without `.nullable()` on `line` and `endLine`, which the API rejects. Those
fields are now nullable, and null is normalized away before a `Finding` is recorded.

Nothing here claims the typed transport produces better findings. It removes one failure
mode. Whether the model chooses good tools and writes accurate claims is unaffected and
unmeasured.
