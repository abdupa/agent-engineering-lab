import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseRunLabelText, type RunLabelLoad } from './run-label.schema';

/**
 * Labels are stored one file per run, named by run id, so a label can be found from a
 * record without an index to keep in step with the directory.
 */
export function labelPath(directory: string, runId: string): string {
  return join(directory, `${runId}.json`);
}

/** A run with no label is an ordinary state, not an error: most runs have none. */
export async function loadRunLabel(
  directory: string,
  runId: string,
): Promise<RunLabelLoad> {
  let text: string;
  try {
    text = await readFile(labelPath(directory, runId), 'utf8');
  } catch {
    return {
      ok: false,
      reason: 'unreadable_label',
      detail: `no label for run ${runId}`,
    };
  }

  const load = parseRunLabelText(text);
  if (load.ok && load.label.runId !== runId) {
    // A label filed under the wrong run id would silently score one run against another's
    // answers, which is worse than having no label at all.
    return {
      ok: false,
      reason: 'label_rejected',
      detail: 'runId: filename does not match the runId inside the label',
    };
  }
  return load;
}
