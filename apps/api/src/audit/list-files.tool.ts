import { z } from 'zod';
import type { Tool } from '../tools/tool';
import { walkFiles } from './walk';
import type { Workspace } from './workspace';

const inputSchema = z.object({
  path: z.string().trim().default('.'),
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
