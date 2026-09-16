# vX.Y — <Release name>

Status: Planned.

## The product requirement that earns this release

<A concrete user need, in one or two sentences, stated before any code exists.
If you cannot write this honestly, the release is not ready. Build what the product
actually needs instead and let the roadmap wait.>

## Goal

<What this release delivers, and the pattern from PATTERNS.md it advances.>

## Architecture direction

```text
<responsibility diagram — not a commitment to class names>
```

## Preserved boundaries

<What released behaviour must not change. Name the contracts explicitly.>

## Required distinctions

<The confusions this pattern must prevent. If you cannot name any, the pattern is
probably not distinct — revisit /pattern step A.>

- A != B: <consequence of confusing them>

## Reliability policy

<Required. See ../../CROSS_CUTTING.md questions 1-5.>

- **Failure modes:** invalid input, timeout, cancellation, empty result, partial
  result, dependency unavailable — what happens in each.
- **Retryable vs terminal:** which failures may be retried, under what budget.
- **Deadline:** what it is, and what exceeding it does and does not guarantee.
- **Side effects:** does this pattern cause any? If so, what makes repetition safe?
- **Fail open or fail closed** on dependency failure, and why.

## Observability

<Required. See ../../CROSS_CUTTING.md questions 6-9.>

- **Emits on success:**
- **Emits on failure:**
- **Never emitted:** payloads, prompts, credentials, memory contents, permission
  grants, raw provider errors — plus anything specific to this pattern.
- **Correlation:** how the request identifier flows through it.
- **Acceptance test:** given only the logs, an operator can say which boundary failed.

## Security

<What this pattern trusts, what it validates, what authority it holds, and what it
could be tricked into doing.>

## Milestones

| Task | Objective and required outcome | Evidence / exit criteria |
| --- | --- | --- |
| VX.Y-001 | | |

## Evaluation

<What is measurable here, and what a regression would look like.>

## Non-goals

<What this release deliberately excludes.>

## What this will not prove

<Required. The most useful section in the document. What the tests establish, and
what they do not — mechanics vs quality, fixtures vs production, fake vs live.>
