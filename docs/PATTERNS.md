# Patterns — the thirty agents, decided

Source: Imran Ahmad, _30 Agents Every AI Engineer Must Build_ (Packt). Used as a
**catalogue of architectures**, not a build list.

Every agent in that catalogue gets one of four verdicts here. None is left undecided,
and none is skipped by silence.

| Verdict     | Meaning                                                    |
| ----------- | ---------------------------------------------------------- |
| **Built**   | Already implemented and tested in this repository          |
| **Build**   | Scheduled — a distinct architecture we will implement      |
| **Gated**   | Real pattern, but built only when a written trigger fires  |
| **Folded**  | Not a distinct architecture; absorbed into another pattern |
| **Skipped** | Deliberately not built, with a stated reason               |

## The selection rule

Build a pattern when it introduces a **distinct architectural boundary or failure mode**
that the existing patterns do not already cover.

Skip it when it is the same architecture carrying different domain knowledge. Domain
expertise is real and valuable — it is just not an architecture, and it is acquired from
the domain, not from this repository.

---

## 1 · Foundational cognitive

| #   | Agent                      | Verdict   | Reason                                                                                                       |
| --- | -------------------------- | --------- | ------------------------------------------------------------------------------------------------------------ |
| 1   | Autonomous Decision-Making | **Built** | v0.3 bounded agent loop. Perception→decision→action with budgets, deadlines and cancellation. `AgentRunner`. |
| 2   | Planning                   | **Build** | Distinct: DAG decomposition, dynamic replanning, and the hard part — knowing when to stop replanning.        |
| 3   | Memory-Augmented           | **Build** | Distinct: working / episodic / semantic separation, and selection policy as a thing apart from storage.      |

## 2 · Information retrieval and data

| #   | Agent                     | Verdict                           | Reason                                                                                                                                                                     |
| --- | ------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4   | Knowledge Retrieval       | **Build** (extend)                | v0.5 gives chunking, lexical and semantic retrieval, context assembly and citations. Missing and worth adding: hybrid search, source provenance, dynamic chunking.         |
| 5   | Document Intelligence     | **Build**                         | Distinct: unstructured → schema. OCR, layout, extraction. Every client has PDFs; this is the most requested capability in the catalogue.                                   |
| 6   | Scientific Research       | **Folded** → Planning + Retrieval | Literature synthesis and gap-finding is planning over a retrieval corpus. No new boundary.                                                                                 |
| 7   | Data Analysis             | **Build**                         | Distinct and important: **code execution is a different trust boundary from tool calling.** Sandboxing, resource limits, and output you cannot schema-validate in advance. |
| 8   | Verification & Validation | **Build**                         | This closes the gap v0.5 documented and could not fill: _citation integrity ≠ factual support_. NLI and consistency checking is the missing half of grounded generation.   |
| 9   | General Problem Solver    | **Skipped**                       | "Meta-reasoning for open-ended tasks" names an aspiration, not an architecture. Nothing to implement that the planning agent does not already cover.                       |

## 3 · Tool manipulation and orchestration

| #   | Agent                        | Verdict   | Reason                                                                                                                              |
| --- | ---------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 10  | Tool-Using                   | **Built** | v0.2 + v0.3. Registry, permissioned executor, input/output validation, deadlines, cooperative cancellation, failure-as-observation. |
| 11  | Chain-of-Agents Orchestrator | **Gated** | Trigger: evaluation shows a routed pipeline beats one agent with tools on a real task. Default stance stays "one agent with tools." |
| 12  | Agentic Workflow System      | **Build** | Distinct: long-running execution plus human escalation gates. Builds directly on the v0.4 checkpoint and pause semantics.           |

## 4 · Software engineering and systems

| #   | Agent                      | Verdict   | Reason                                                                                                                                                                                                   |
| --- | -------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 13  | Code-Generation (TDD loop) | **Build** | Distinct: self-correction driven by _executable_ feedback rather than model judgement. The most reliable correction signal in the catalogue.                                                             |
| 14  | Compliance / Security      | **Build** | Distinct and high client value: policy-as-code, static analysis, dependency scanning. Deterministic enforcement over probabilistic output — the clearest expression of this repository's core principle. |
| 15  | Self-Improving             | **Gated** | Trigger: a working evaluation harness with regression detection. An agent that changes its own policy without measurement is a liability, not a capability.                                              |

## 5 · Interaction and content

| #   | Agent            | Verdict                      | Reason                                                                                                                                                                 |
| --- | ---------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 16  | Conversational   | **Gated**                    | Trigger: the product acquires a conversational surface. The lesson — conversation state ≠ agent state ≠ memory — is worth having, but it needs a real UI to be honest. |
| 17  | Content Creation | **Folded** → Chain-of-Agents | Researcher → Writer → Editor is a multi-agent pipeline with a style constraint. It is the demo case for #11, not a separate architecture.                              |
| 18  | Recommendation   | **Skipped**                  | Needs a user-interaction graph and a population of users. Recommender architecture is a field of its own and is not agent architecture.                                |

## 6 · Multi-modal and physical

| #   | Agent                 | Verdict     | Reason                                                                                                                                                      |
| --- | --------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 19  | Vision-Language       | **Gated**   | Trigger: the product must read screenshots, diagrams or scanned layout. Pairs naturally with #5 Document Intelligence and is cheap to add once that exists. |
| 20  | Audio Processing      | **Gated**   | Trigger: a named requirement for speech. Whisper + VAD + diarisation is a real pipeline, but it teaches signal handling more than agent architecture.       |
| 21  | Physical World / IoT  | **Skipped** | Requires hardware and sensor streams. No access, no requirement, and the architecture lesson is sensor fusion rather than agency.                           |
| 22  | Embodied Intelligence | **Skipped** | Requires robotics. The safety-envelope idea is genuinely valuable and is captured instead in #14 and the guardrails release.                                |

## 7 · Safety, governance and domain specialists

| #   | Agent                   | Verdict                 | Reason                                                                                                                                                                                                  |
| --- | ----------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 23  | Ethical Reasoning       | **Folded** → Guardrails | Deontic constraints and rule-set evaluation are the guardrails release. Keeping them separate would imply ethics is a component rather than a boundary.                                                 |
| 24  | Explainable             | **Build**               | Underrated and highly marketable. We have observability; explainability is the next layer — auditable reasoning traces, calibrated confidence, counterfactuals. Enterprise buyers ask for this by name. |
| 25  | Healthcare Intelligence | **Skipped** (domain)    | = Retrieval + Verification + calibrated uncertainty. The architecture is covered; the clinical knowledge is not ours to fake.                                                                           |
| 26  | Financial Advisory      | **Skipped** (domain)    | = Planning + Verification + approval gates, under supervision. Architecture covered.                                                                                                                    |
| 27  | Legal Intelligence      | **Skipped** (domain)    | = Document Intelligence + Retrieval + Verification. Architecture covered, and it is the clearest proof of the thesis.                                                                                   |
| 28  | Education Intelligence  | **Skipped** (domain)    | Bayesian knowledge tracing is a modelling technique, not an agent architecture.                                                                                                                         |
| 29  | Collective Intelligence | **Gated**               | Trigger: same as #11. Weighted voting and debate protocols are the honest test of whether multiple agents beat one — worth running once we can measure it.                                              |

---

## Tally

| Verdict | Count | Which                            |
| ------- | ----- | -------------------------------- |
| Built   | 2     | 1, 10                            |
| Build   | 10    | 2, 3, 4, 5, 7, 8, 12, 13, 14, 24 |
| Gated   | 6     | 11, 15, 16, 19, 20, 29           |
| Folded  | 3     | 6, 17, 23                        |
| Skipped | 8     | 9, 18, 21, 22, 25, 26, 27, 28    |

Twenty-nine catalogued, twelve architectures built or building, seventeen decided
against with a reason on the record.

## The four domain specialists, explicitly

Healthcare, financial, legal and education agents are skipped **not because they are
unimportant, but because they are compositions.** This is the central claim of the
charter, and it should be checkable:

```
Legal intelligence agent
  = Document Intelligence (#5)      contract parsing, clause extraction
  + Knowledge Retrieval (#4)        precedent search with provenance
  + Verification (#8)               statutory consistency checking
  + Explainable (#24)               audit trail a lawyer can review
  + Guardrails                      nothing filed without human approval
```

If a client asks for a legal agent and that decomposition does not hold, the thesis is
wrong and this file should be revised. That is the test.

## Revisiting

Every gated pattern is reviewed at each release boundary. Record either the trigger
firing, or an explicit _"still not triggered"_ — never leave it to silence. A gate that
is never reviewed is a decision that was never made.
