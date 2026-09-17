import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import {
  parseAnswerKeyText,
  type AnswerKey,
  type AnswerKeyLoad,
} from './answer-key.schema';

/**
 * Checks that a labeled target still matches the key that describes it.
 *
 * This is the quietest way the whole design can fail. Line numbers stay valid-looking
 * after a file is edited, so a stale key scores findings against positions that no longer
 * mean anything and reports a confident number for a measurement that stopped being real.
 * Hashing every file turns that into a loud failure at load time.
 */

export const TARGET_PROBLEMS = [
  'file_missing',
  'file_unreadable',
  'hash_mismatch',
  'line_out_of_range',
  'unkeyed_file',
] as const;

export type TargetProblemKind = (typeof TARGET_PROBLEMS)[number];

export interface TargetProblem {
  readonly kind: TargetProblemKind;
  /** The file it concerns, relative to the tree. Never file content. */
  readonly path: string;
  /** A defect id when the problem belongs to one, otherwise absent. */
  readonly defectId?: string;
}

export type TargetVerification =
  | { readonly ok: true; readonly files: number; readonly defects: number }
  | { readonly ok: false; readonly problems: readonly TargetProblem[] };

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Lines as a reader counts them: a trailing newline does not add an empty last line. */
export function countLines(text: string): number {
  if (text === '') return 0;
  const lines = text.split('\n');
  return lines[lines.length - 1] === '' ? lines.length - 1 : lines.length;
}

/** Every file under a directory, relative to it, using forward slashes. */
async function walk(directory: string, prefix = ''): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const found: string[] = [];
  for (const entry of entries) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      found.push(...(await walk(join(directory, entry.name), relative)));
    } else if (entry.isFile()) {
      found.push(relative);
    }
  }
  return found.sort();
}

/**
 * Reads the tree named by the key and compares it, file by file, against what the key
 * recorded. Every problem is collected rather than the first one thrown, because a key
 * that has fallen out of date is usually out of date in several places at once and
 * fixing them one failure at a time is slow.
 */
export async function verifyTarget(
  targetDirectory: string,
  key: AnswerKey,
): Promise<TargetVerification> {
  const tree = resolve(targetDirectory, key.tree);
  const problems: TargetProblem[] = [];
  const lineCounts = new Map<string, number>();

  for (const file of key.files) {
    let bytes: Buffer;
    try {
      bytes = await readFile(join(tree, ...file.path.split('/')));
    } catch (error) {
      const code =
        typeof error === 'object' && error !== null && 'code' in error
          ? error.code
          : undefined;
      problems.push({
        kind: code === 'ENOENT' ? 'file_missing' : 'file_unreadable',
        path: file.path,
      });
      continue;
    }

    if (sha256(bytes) !== file.sha256) {
      // The digests themselves are not reported. One of them is in the key already and
      // the other says nothing a person can act on.
      problems.push({ kind: 'hash_mismatch', path: file.path });
      continue;
    }

    lineCounts.set(file.path, countLines(bytes.toString('utf8')));
  }

  for (const defect of key.defects) {
    const lines = lineCounts.get(defect.path);
    // A file that failed above has already been reported; not reporting it twice.
    if (lines === undefined) continue;
    if (defect.endLine > lines) {
      problems.push({
        kind: 'line_out_of_range',
        path: defect.path,
        defectId: defect.id,
      });
    }
  }

  if (key.exhaustive) {
    /**
     * Only meaningful for an exhaustive key. A file present in the tree but absent from
     * the key is a file nobody labeled, and on a target claiming to list every defect
     * that is a hole in the claim rather than an extra file.
     */
    const keyed = new Set(key.files.map((file) => file.path));
    let present: string[];
    try {
      present = await walk(tree);
    } catch {
      present = [];
      problems.push({ kind: 'file_unreadable', path: key.tree });
    }
    for (const path of present) {
      if (!keyed.has(path)) problems.push({ kind: 'unkeyed_file', path });
    }
  }

  return problems.length === 0
    ? { ok: true, files: key.files.length, defects: key.defects.length }
    : { ok: false, problems };
}

/** Reads `key.json` from a target directory. A missing key is a result, not a throw. */
export async function loadAnswerKey(
  targetDirectory: string,
): Promise<AnswerKeyLoad> {
  let text: string;
  try {
    text = await readFile(join(targetDirectory, 'key.json'), 'utf8');
  } catch {
    return {
      ok: false,
      reason: 'unreadable_key',
      detail: `no key.json in ${targetDirectory.split(sep).slice(-2).join('/')}`,
    };
  }
  return parseAnswerKeyText(text);
}
