# Current work

Project: Agent Engineering Lab

Release: v0.6 — First agent: read-only codebase auditor

Current task: V0.6-001 — Workspace confinement and read-only audit tools

Status: Completed

## Delivered

Three audit tools, registered in the existing `ToolRegistry` and reachable only through
`ToolExecutor`: `list-files`, `read-file`, `grep`. All read-only, all confined to one
configured directory.

`Workspace` is the security boundary. Every path arrives from a model and is treated as
hostile: absolute paths rejected, `..` traversal rejected, symlinks resolved and
re-checked, and an exclusion list refusing `.env*`, `*.key`, `*.pem`, `.git/`,
`node_modules/`. Confinement fails closed — a path that cannot be proven inside the root
is denied.

`grep` matches literal substrings and refuses regular expressions. A model-supplied
catastrophic pattern blocks the event loop synchronously, and `ToolExecutor`'s deadline is
a promise race that cannot fire while the loop is blocked, so the existing timeout would
not have protected against it.

## Verification

**540 passed, 27 suites** — up from 493. Typecheck, lint, format, build and diff clean.
42 new audit tests plus 5 more governance assertions now that a v0.6 SPEC exists to check.
Of the audit tests, 16 are escape and refusal attempts: absolute paths, four traversal shapes, a
symlink pointing outside the root, excluded files, binary content, and unauthorised calls.

The symlink case is the one worth noting — lexical confinement passes it and only real-path
resolution catches it. That is tested in both directions.

## Autonomous decisions

**L2 — literal-only `grep`.** Alternative was regex with a bounded executor. Rejected:
the existing deadline cannot interrupt synchronous backtracking. Literal matching removes
the vulnerability class instead of bounding it. Recorded in the SPEC's reliability policy.

**L1** — workspace as a closure-captured factory argument rather than tool input, so the
root is never model-controlled and never enters agent state. Depth, byte and match limits
chosen as round defaults; all are caller-overridable within schema ceilings.

## L3 stop — `run_tests` deferred

The fourth tool would spawn a process. That is a new trust boundary, which
`DECISION_POLICY` classifies as L3, so it was not built. It waits for the guardrails
release and its approval boundary.

The roadmap predicted this would fire in the first week. It fired on the first milestone.

## Next

**V0.6-002 — Finding contract and audit service.** The `Finding` schema plus the service
that runs `AgentRunner` against these tools with fake-provider trajectory tests. Not
started; this milestone is complete and stops here.

## Limitations

Confinement is tested against known attacks, which is not the same as proven safe. The
exclusion list cannot recognise a secret stored under an ordinary name. Binary detection
is a NUL-byte heuristic over the first slice. No agent has yet run against these tools —
that is V0.6-002.
