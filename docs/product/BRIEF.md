# Product brief — Contract Risk Review

Written 2026-09-18, before any code. Dated deliberately: a definition of done that can be
edited after the results arrive is not a definition of done.

## Why this exists

[CHARTER.md](../CHARTER.md) promises "one production product that earns them." There has not
been one. Every release so far named a requirement, and every one of those requirements was
written by the same person who then decided whether it had been met.

That is the weakness this product is meant to close. It does not close it completely — the
requirements below are still mine — but it changes three things that matter:

1. **The ground truth is not mine.** Whether a paragraph is an indemnification clause is
   settled by the contract and by lawyers who annotated it, not by my opinion.
2. **The domain punishes vagueness.** "Something is wrong in this file" is a finding in a
   code audit. In a contract review it is nothing.
3. **There is a real reader to imagine.** A reviewer with a deadline, not a test suite.

## It is also the test of the central claim

[PATTERNS.md](../PATTERNS.md) skips legal intelligence as a domain, on the grounds that it
is a composition rather than a new architecture:

```
Legal intelligence = Document Intelligence + Knowledge Retrieval + Verification
                   + Explainable + Guardrails
```

and then says plainly: _"If a client asks for a legal agent and that decomposition does not
hold, the thesis is wrong and this file should be revised. That is the test."_

This product runs that test. If the agent arrives by composing what is already built plus
the scheduled releases, the thesis holds. If it needs something the decomposition does not
name, `PATTERNS.md` is wrong and gets revised.

## Who it is for

A **contract reviewer** — in-house counsel or a commercial lawyer — who has a stack of
executed agreements and a question like "which of these have an uncapped liability clause,
and where?"

They are not looking for advice. They are looking to not read forty pages to find three
paragraphs.

## What a finished review looks like

For one contract, a list of findings. Each finding carries:

- **the clause category** — one of the categories the key defines
- **the exact span** in the contract where it appears
- **the clause text itself**, read from the document and never retyped by the model
- **a risk level**, and what makes it that level
- **nothing else** — no summary of what it means, no recommendation, no comparison to market

A reviewer opening it should be able to confirm or dismiss each finding in seconds by
looking at the cited text. That is the same bar the audit agent is held to and the reason
evidence is read from the source rather than supplied by the model.

## Definition of done

The first release is done when **all** of these are true:

1. Given a contract from the evaluation set, it returns findings in the shape above.
2. Every cited span is read from the document. No finding carries model-written clause text.
3. It is scored by the v0.7 harness against the expert key, and the score is recorded
   whatever it is.
4. It reports what it did not find, not only what it found.
5. Cost per contract is measured and stated.

Note what is **not** in that list: any particular score. The first release is done when the
number exists and is honest, not when the number is good. Setting a target before the first
measurement is how targets get met by moving them.

## What would make it unacceptable

Any one of these fails the release regardless of the score:

- **A clause cited at a span that does not contain it.** This is the failure the audit agent
  made repeatedly, and it is worse here. A reviewer who checks one wrong citation stops
  trusting all of them.
- **Model-written clause text presented as quotation.** The document is the authority.
- **Advice.** "This clause is unfavourable and should be renegotiated" is outside scope, and
  the line is not fuzzy: report what is there and where, never what to do about it.
- **A confident score on a subset presented as a result.** Evaluation runs on a stated
  sample; the sample size travels with every number.
- **Silence about what it missed.** Recall is the number that matters to a reviewer, and it
  is the one an agent is most able to hide.

## Scope, held from the first commit

**Decision support for a qualified reviewer. Never advice, never filed, never acted on
automatically.**

Guardrails and human approval are scheduled for v1.1, which is three releases away. That is
too late to start behaving as if they exist, so the scope line holds from now: the output is
a reading aid handed to a person who is qualified to judge it.

This is written here rather than deferred to the guardrails release because a product that
spends three releases producing advice and then adds an approval gate has trained everyone,
including its author, to treat the advice as the product.

## Evidence

**CUAD — the Contract Understanding Atticus Dataset**, from The Atticus Project.
510 commercial contracts, 13,000+ clause labels across 41 categories, annotated by lawyers,
licensed CC BY 4.0. It ships plain text alongside the PDFs and includes deliberate negative
examples where a category is absent.

Why it is worth more than another hand-built target:

| `small-service` (v0.7)                 | CUAD                                    |
| -------------------------------------- | --------------------------------------- |
| I wrote the code and the answer key    | Lawyers wrote the key; I wrote nothing  |
| 7 planted defects                      | 13,000+ labels                          |
| 2 control files I chose to leave clean | Negative examples across every category |
| Measures consistency with myself       | Measures agreement with domain experts  |

The v0.7 harness already reads a key, matches findings to it by span, and reports precision,
recall, citation accuracy and cost. **The shape is right; the key changes.**

Attribution is required by the licence and belongs in the repository from the first commit
that uses the data.

## Known gaps between CUAD and the harness

Named now because they are where the work actually is:

**Offsets versus lines.** The harness matches line spans. CUAD locates clauses by character
position. The conversion is mechanical and is exactly the kind of place an off-by-one hides
for weeks, so it gets its own tests before anything is scored.

**CUAD has no risk levels.** The categories are descriptive, not ranked. Assigning risk is a
product decision I have to make and defend, and it must be written down before any run — it
is the one part of the key that is mine, and the severity metric is only as honest as that
mapping.

**Scale is a real cost risk.** One audit run over six small files cost 30,000 tokens. A
single commercial contract runs to tens of pages, and the full set is 510 of them. Every run
is scoped to a stated sample with a token budget, and the sample size is reported beside
every number.

**Exhaustive, but only within the categories.** CUAD labels 41 categories. A clause outside
those categories is unlabeled, not absent — so the key is exhaustive _for those categories_
and the `exhaustive` flag must be set with that scope stated, or unmatched findings will be
scored as false positives when they may be true.

## What this will not prove

**That the agent is fit for legal work.** It is not, and nothing planned here would make it
so. It is a reading aid measured against a research dataset.

**That performance on CUAD transfers.** CUAD is commercial contracts filed publicly. A
reviewer's actual stack may look nothing like it.

**That the decomposition in PATTERNS.md is right** — unless it is run to the point where the
missing pieces are needed. Building the first slice proves only that the first slice
composes.

**That the requirements are real.** They are still mine. A simulated production project with
a real dataset is better than a fixture I wrote, and it is not a client.
