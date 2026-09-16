import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Workspace } from './workspace';

export interface WalkOptions {
  readonly maxDepth: number;
  readonly limit: number;
  readonly signal?: AbortSignal;
}

export interface WalkResult {
  /** Workspace-relative file paths, sorted for deterministic output. */
  readonly files: string[];
  /** True when the limit stopped the walk before it finished. */
  readonly truncated: boolean;
}

/**
 * Depth-limited directory walk confined to the workspace.
 *
 * Directory entries are re-confined on every level rather than trusted because they
 * came from inside the root: a symlink discovered mid-walk is exactly the case that
 * lexical confinement alone would miss.
 */
export async function walkFiles(
  workspace: Workspace,
  startRelative: string,
  { maxDepth, limit, signal }: WalkOptions,
): Promise<WalkResult> {
  const start = await workspace.resolveExisting(startRelative);
  const files: string[] = [];
  let truncated = false;

  const visit = async (absolute: string, depth: number): Promise<void> => {
    if (truncated || depth > maxDepth) return;
    if (signal?.aborted) throw new Error('Walk cancelled');

    const entries = await readdir(absolute, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (truncated) return;
      if (signal?.aborted) throw new Error('Walk cancelled');

      const childAbsolute = join(absolute, entry.name);
      const childRelative = workspace.relativize(childAbsolute);
      if (workspace.isExcluded(childRelative)) continue;

      if (entry.isDirectory()) {
        await visit(childAbsolute, depth + 1);
      } else if (entry.isFile()) {
        if (files.length >= limit) {
          truncated = true;
          return;
        }
        files.push(childRelative);
      }
      // Symlinks and other entry types are skipped rather than followed. Following
      // them is how a walk leaves a directory it was told to stay inside.
    }
  };

  await visit(start, 1);
  return { files, truncated };
}
