# v0.2 Tool System Mastery

This is a learning artifact, not a claim that the learner has completed these
exercises. Use [REVIEW.md](REVIEW.md) for architecture and verification evidence.
Source paths below are relative to the repository root.

| Topic                       | Meaning and purpose                                                                                                         | Repository location                                                   | Mastery question                                                                                          |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Tool contract               | Identity, schemas, permissions, and a callable operation describe deterministic capability independently of a model vendor. | apps/api/src/tools/tool.ts                                            | Why is a tool not an OpenAI function-call type or an agent?                                               |
| Discovery versus invocation | Finding a capability neither runs it nor grants permission.                                                                 | ToolRegistry.register/get/list in apps/api/src/tools/tool-registry.ts | Why must successful lookup not imply execution is allowed?                                                |
| Type erasure                | A dynamic name loses concrete handler input/output types; the registry must not promise arbitrary caller-selected types.    | RegisteredTool and the assertion inside ToolExecutor                  | What evidence makes the executor's assertion justified, and what trusted-registration assumptions remain? |
| Runtime validation          | parseAsync checks actual values and returns transformed/stripped data before crossing each boundary.                        | apps/api/src/tools/tool-executor.ts                                   | Why must the handler receive parsed input and the caller receive parsed output?                           |
| Deterministic computation   | Ordinary arithmetic does not need a model.                                                                                  | apps/api/src/tools/add-numbers.tool.ts                                | Why does an overflowing finite-input sum still require output validation?                                 |
| Enforceable policy          | Declared requirements matter only when grants are checked before work.                                                      | ToolExecutor's requiredPermissions check; calculate in addNumbersTool | Why is an absent context denied even when requiredPermissions is empty?                                   |
| Snapshot semantics          | Copies/frozen arrays prevent later mutation changing checked metadata or handler grants.                                    | ToolRegistry registration and ToolExecutor context construction       | Which objects remain shared, and why is this not deep isolation?                                          |
| Deadlines and abort         | One budget covers all stages; AbortSignal requests cooperative cancellation.                                                | ToolExecutor's timer, checkDeadline, and handler context              | If input validation resolves after timeout, why must the handler never start?                             |
| Safe failures               | Fixed codes/messages communicate failure categories without exposing data or raw causes.                                    | apps/api/src/tools/tool-execution.error.ts                            | Why should a handler's claimed error code not determine the executor's policy result?                     |
| Observability               | A final execution record describes caller-visible settlement and validated success.                                         | ToolExecutor finally block and request-context.ts                     | Why does a timeout record not prove the handler stopped, and why is no second summary emitted?            |
| Privacy and audit limits    | Allowlisted metadata supports diagnosis without collecting payloads or permission lists.                                    | docs/concepts/tool-observability.md and tool-observability.spec.ts    | What evidence would still be missing if an auditor needed durable, uniquely identified executions?        |
| Deterministic tests         | Fake handlers, schema callbacks, and virtual timers control effects and time.                                               | Four apps/api/src/tools/*.spec.ts suites                              | How can tests prove late-stage suppression without sleeping or calling a network?                         |

## Trace exercises

1. Register addNumbersTool and trace { left: 2, right: 3 } with calculate granted.
   Identify where identity, permission, runtime type, and result checks occur.
2. Remove the grant. Explain why neither the input schema callback nor the handler
   should run and which safe event/error describes the denial.
3. Delay input parsing beyond the deadline. Then resolve it. Explain the difference
   between returning timeout and preventing later handler invocation.
4. Let a handler ignore abort. Explain the work the executor cannot stop and why
   retries would require reasoning about repeated effects rather than a generic loop.
5. Make the logger throw. Explain why the business result survives and why audit
   completeness can no longer be assumed.

The central lesson is that discovery, validation, permission, execution, and evidence
are separate responsibilities. A controlled tool system establishes those boundaries
before an agent is introduced; it does not itself supply autonomous reasoning or a
security sandbox. Further tasks require defined requirements, not just roadmap labels.
