import { readFile, stat } from 'node:fs/promises';
import { z } from 'zod';
import type { Tool } from '../tools/tool';
import { WorkspaceDenied } from './workspace';
import type { Workspace } from './workspace';

const MAX_BYTES_CEILING = 200_000;

const inputSchema = z.object({
  path: z.string().trim().min(1),
  maxBytes: z.number().int().min(1).max(MAX_BYTES_CEILING).default(64_000),
});

const outputSchema = z.object({
  path: z.string(),
  content: z.string(),
  bytes: z.number().int().nonnegative(),
  truncated: z.boolean(),
});

export type ReadFileInput = z.infer<typeof inputSchema>;
export type ReadFileOutput = z.infer<typeof outputSchema>;

export function createReadFileTool(
  workspace: Workspace,
): Tool<ReadFileInput, ReadFileOutput> {
  return {
    name: 'read-file',
    description:
      'Read a UTF-8 text file from the audited codebase, truncated to a byte budget',
    requiredPermissions: ['audit:read'],
    inputSchema,
    outputSchema,
    execute: async ({ path, maxBytes }) => {
      const absolute = await workspace.resolveExisting(path);
      const info = await stat(absolute);
      if (!info.isFile()) throw new WorkspaceDenied('NOT_FOUND');

      const buffer = await readFile(absolute);
      const slice = buffer.subarray(0, maxBytes);
      // A NUL byte in the first slice is the cheap, deterministic binary test. It is a
      // heuristic: a binary file without one early would still decode to nonsense.
      if (slice.includes(0)) throw new WorkspaceDenied('EXCLUDED');

      return {
        path: workspace.relativize(absolute),
        content: slice.toString('utf8'),
        bytes: buffer.byteLength,
        truncated: buffer.byteLength > slice.byteLength,
      };
    },
  };
}
