---
name: claims-audit
description: Check that documentation does not claim more than the tests actually prove. Run before closing any release, and whenever a README, SPEC, RELEASE or study-guide section is written or edited.
---

# Claims audit

This repository's core discipline is that **no document claims evidence it does not
have**. This skill checks that, because a rule nobody checks is a rule nobody follows.

## What to check

For each claim in the documents changed by this release:

1. **Implemented vs planned.** Does any sentence describe planned capability in the
   present tense? Search for future features written as current behaviour.
2. **Does a test back it?** For each behavioural claim, name the test that proves it.
   If you cannot name one, the claim is unsupported — soften it or add the test.
3. **Mechanism vs quality.** A passing deterministic test proves mechanics. It does not
   prove model quality, real-world usefulness, or accuracy. Flag any sentence that
   crosses that line.
4. **The five-state check** for anything retrieval or citation shaped:
   `retrieved ≠ included ≠ cited ≠ supported ≠ true`. Which state does the claim
   actually establish?
5. **Fake vs live.** Evidence from fake providers or fake embeddings proves wiring, not
   behaviour. Any claim about live model behaviour needs a live run behind it.
6. **Counts are real.** Every number in a document — test counts, suites, ADRs — must
   match what the gate actually printed today, not what it printed last release.

## Every release document needs a limits section

If a SPEC, REVIEW or RELEASE has no honest statement of what its evidence does _not_
prove, it is not finished. That section is not a disclaimer; it is the most useful part
of the document.

## Output

List each unsupported or overreaching claim as:

```
<file>:<line>  CLAIM: "<quoted text>"
              PROVES: <what the evidence actually establishes>
              FIX:    <soften to X | add test Y | mark as planned>
```

Report "no unsupported claims found" only after actually checking each one.
