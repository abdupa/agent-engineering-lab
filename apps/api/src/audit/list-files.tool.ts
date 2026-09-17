import { z } from 'zod';
import type { Tool } from '../tools/tool';
import { walkFiles } from './walk';
import type { Workspace } from './workspace';

/**
 * Empty means the workspace root.
 *
 * `.default()` only applies when a field is absent, and under strict Structured Outputs
 * nothing is absent — the model must supply every property. It supplied an empty string,
 * which passed the schema and then threw at execution. Defaults stopped protecting
 * model-supplied input the moment typed arguments were turned on.
 */
const rootedPath = z
  .string()
  .trim()
  .default('.')
  .transform((value) => (value === '' ? '.' : value));

const inputSchema = z.object({
  path: rootedPath,
  maxDepth: z.number().int().min(1).max(10).default(4),
  limit: z.number().int().min(1).max(500).default(200),
});

const outputSchema = z.object({
  files: z.array(z.string()),
  truncated: z.boolean(),
});

export type ListFilesInput = z.infer<typeof inputSchema>;
export type ListFilesOutput = z.infer<typeof outputSchema>;

/**
 * The workspace is captured in the closure rather than passed as input: the root must
 * never be model-controlled, and must never appear in agent state.
 */
export function createListFilesTool(
  workspace: Workspace,
): Tool<ListFilesInput, ListFilesOutput> {
  return {
    name: 'list-files',
    description:
      'List files under a directory in the audited codebase, relative to its root',
    requiredPermissions: ['audit:read'],
    inputSchema,
    outputSchema,
    execute: async ({ path, maxDepth, limit }, { signal }) =>
      walkFiles(workspace, path, { maxDepth, limit, signal }),
  };
}
