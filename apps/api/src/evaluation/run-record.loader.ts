import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseRunRecordText, type RunRecordLoad } from './run-record.schema';

/**
 * Reading stored runs off disk. Separated from the schema so the validation rules can be
 * exercised without a filesystem, and so the one place that touches I/O is small enough
 * to read in full.
 */

/**
 * The short code from a filesystem error — ENOENT, EACCES, EISDIR — or `unknown`.
 *
 * Deliberately not written as `error instanceof Error && 'code' in error`. That check
 * returns **false** for errors thrown by Node's own filesystem code when the test runner
 * supplies its own globals, because `instanceof` compares against one realm's `Error`
 * and the error was constructed in another. The first version of this function used it
 * and reported `unknown` for a plain missing file.
 *
 * Checking for the property instead works in every realm, which is what a diagnostic
 * needs to do if it is going to be trusted when something has already gone wrong.
 */
function systemErrorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    // No cast needed: the `in` check above narrows `error` to an object carrying `code`.
    const { code } = error;
    if (typeof code === 'string' && code.length > 0) return code;
  }
  return 'unknown';
}

/** One record. A missing or unreadable file is a result, never an exception. */
export async function loadRunRecord(path: string): Promise<RunRecordLoad> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    // The system error's message carries the full path. That is fine in a local script
    // and wrong in a log, so only the code is kept.
    return {
      ok: false,
      reason: 'unreadable_file',
      detail: systemErrorCode(error),
    };
  }
  return parseRunRecordText(text);
}

export interface LoadedRecord {
  /** The file this came from, so a failure can be traced back to something on disk. */
  readonly file: string;
  readonly load: RunRecordLoad;
}

/**
 * Every `.json` file in a directory, in filename order.
 *
 * Filenames are timestamps, so sorting them sorts the runs chronologically. That is a
 * property of how the script names files rather than a guarantee, and nothing downstream
 * depends on the order — it exists so that reading a report is not confusing.
 *
 * A directory containing one bad record still returns the good ones. An evaluation run
 * that refuses to report anything because a single file is corrupt is less useful than
 * one that reports eight successes and one named failure.
 */
export async function loadRunRecords(
  directory: string,
): Promise<LoadedRecord[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => entry.name)
    .sort();

  return Promise.all(
    files.map(async (name) => ({
      file: name,
      load: await loadRunRecord(join(directory, name)),
    })),
  );
}

/** Counts by outcome, for a caller that wants the headline before the detail. */
export function summarizeLoads(loaded: readonly LoadedRecord[]): {
  readonly total: number;
  readonly loaded: number;
  readonly unscoreable: number;
} {
  const ok = loaded.filter((entry) => entry.load.ok).length;
  return {
    total: loaded.length,
    loaded: ok,
    unscoreable: loaded.length - ok,
  };
}
