# small-service — a labeled evaluation target

A small TypeScript service, written entirely for evaluation. Seven defects were planted on
purpose. Two of the six files contain none and exist as controls.

## Do not fix the defects

They are the answers. Repairing one silently destroys the measurement, and the answer key
records a hash of every file, so a "helpful" edit turns the target unscoreable rather than
turning it green.

The directory is excluded from Prettier and ESLint for the same reason. A formatter would
change bytes the key has fingerprinted, and a linter would report the planted answers as
errors and fail the build.

## Planted secrets must not imitate a real vendor

The hardcoded credential in `config.ts` was first written with a `rk_live_` prefix. GitHub's
push protection recognised it as a Stripe live key and refused the push.

The fixture only needs a value that reads as a production credential. Imitating a specific
vendor's format adds nothing to the test and makes the repository unpushable, so use a
neutral shape — a service name, a `prod` marker, and hex — and keep every real vendor prefix
out of the tree.

## Layout

```text
small-service/
  README.md      this file
  key.json       the answer key
  src/           the audited tree — the agent sees only this
```

**The key sits outside `src/` deliberately.** An agent pointed at this target reads the
tree, and a key stored inside it would be a file the agent could simply open and copy.

## Running an audit against it

```bash
AUDIT_ROOT=docs/eval/targets/small-service/src pnpm audit:live
```

## What the key claims

`exhaustive: true` means every line here was written for this purpose and the seven listed
defects are all of them. On an exhaustive target a finding that matches no keyed defect is
a false positive.

That claim is only available because the target is synthetic. A key over real code would
set `exhaustive: false`, and an unmatched finding there is unclassified rather than wrong —
run 5 found two genuine defects in this repository that nobody had planted, and scoring
those as errors would have punished the most valuable run so far.

## What it cannot measure

Whether the agent is any good at auditing unfamiliar code. The defects here were chosen by
the same person who will read the results, and they are the recognizable textbook kinds:
injection, traversal, a weak random source, a hardcoded credential, a comment that lies.

Real defects are rarely that quotable. This target measures whether a change made the agent
better or worse at a fixed task. It does not measure competence, and a good score on it is
not evidence for one.
