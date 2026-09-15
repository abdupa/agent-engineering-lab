---
name: verify
description: Run the full validation gate (format, lint, typecheck, tests, build, diff) and report the result honestly. Use before declaring any milestone complete, and before any commit or push. Never chain this with a push.
---

# Verify

The canonical milestone gate. A milestone is not complete until this passes and you have
**read the verdict**.

## Run

```sh
pnpm verify
```

That composes: `format:check` → `lint` → `typecheck` → `test` → `build` → `git diff --check`.

If pnpm is unavailable on this machine, run the parts directly:

```sh
apps/api/node_modules/.bin/jest --runInBand   # tests
apps/api/node_modules/.bin/tsc --noEmit       # typecheck
node_modules/.bin/eslint . --max-warnings=0   # lint
node_modules/.bin/prettier --check .          # format
```

## Rules

1. **Read the whole verdict.** Never `tail -1` a gate log. Never chain `verify && push`.
2. **Never report a pass you did not see.** If part of the gate could not run, say which
   part and why. A partial gate is a partial claim.
3. **Triage before shipping.** If something fails, re-run that one suite with `-k` or a
   path filter and fix the cause. Do not re-run the whole gate hoping.
4. **Report real numbers.** "468 tests in 25 suites passed" — not "tests passed".

## Report format

```
GATE: PASS | FAIL | PARTIAL
  format    ✓ / ✗ / not run
  lint      ✓ / ✗ / not run
  typecheck ✓ / ✗ / not run
  tests     468 passed, 25 suites
  build     ✓ / ✗ / not run
  diff      ✓ / ✗ / not run
```

State any check that did not run, and why. Silence about a skipped check is a false pass.
