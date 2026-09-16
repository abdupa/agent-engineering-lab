import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import type { Tool } from '../tools/tool';
import { walkFiles } from './walk';
import type { Workspace } from './workspace';

const MAX_LINE_LENGTH = 300;
const MAX_FILE_BYTES = 200_000;

const inputSchema = z.object({
  // Literal substring, never a regular expression. A model-supplied pattern with
  // catastrophic backtracking blocks the event loop synchronously, and the executor's
  // deadline is a promise race that cannot fire while the loop is blocked. Refusing
  // regular expressions removes the class rather than trying to bound it.
  query: z.string().min(1).max(200),
  path: z.string().trim().default('.'),
  caseSensitive: z.boolean().default(false),
  maxDepth: z.number().int().min(1).max(10).default(4),
  limit: z.number().int().min(1).max(200).default(50),
});

const outputSchema = z.object({
  matches: z.array(
    z.object({
      path: z.string(),
      line: z.number().int().positive(),
      text: z.string(),
    }),
  ),
  truncated: z.boolean(),
});

export type GrepInput = z.infer<typeof inputSchema>;
export type GrepOutput = z.infer<typeof outputSchema>;

export function createGrepTool(
  workspace: Workspace,
): Tool<GrepInput, GrepOutput> {
  return {
    name: 'grep',
    description:
      'Find literal text in the audited codebase and return file, line number and line',
    requiredPermissions: ['audit:read'],
    inputSchema,
    outputSchema,
    execute: async (
      { query, path, caseSensitive, maxDepth, limit },
      { signal },
    ) => {
      const { files } = await walkFiles(workspace, path, {
        maxDepth,
        // Scan a wider set of files than we will report matches from.
        limit: 500,
        signal,
      });
      const needle = caseSensitive ? query : query.toLowerCase();
      const matches: GrepOutput['matches'] = [];

      for (const file of files) {
        if (matches.length >= limit) return { matches, truncated: true };
        if (signal?.aborted) throw new Error('Search cancelled');

        const buffer = await readFile(join(workspace.root, file));
        if (buffer.byteLength > MAX_FILE_BYTES) continue;
        if (buffer.subarray(0, 4096).includes(0)) continue;

        const lines = buffer.toString('utf8').split('\n');
        for (let index = 0; index < lines.length; index++) {
          const raw = lines[index] ?? '';
          const hay = caseSensitive ? raw : raw.toLowerCase();
          if (!hay.includes(needle)) continue;
          if (matches.length >= limit) return { matches, truncated: true };
          matches.push({
            path: file,
            line: index + 1,
            text: raw.slice(0, MAX_LINE_LENGTH).trimEnd(),
          });
        }
      }
      return { matches, truncated: false };
    },
  };
}
