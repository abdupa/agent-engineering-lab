import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  loadRunRecord,
  loadRunRecords,
  summarizeLoads,
  type LoadedRecord,
} from '../../src/evaluation/run-record.loader';

/**
 * The schema is tested against hand-written examples elsewhere. This runs it against the
 * real corpus — nine records written by nine paid runs, which is the entire evidence base
 * v0.6 produced and cannot be recreated without spending the money again.
 *
 * A schema that rejects them is wrong about history, not the other way round.
 */

const RECORDS = resolve(__dirname, '../../../..', 'docs/releases/v0.6/runs');

let loaded: LoadedRecord[];

beforeAll(async () => {
  loaded = await loadRunRecords(RECORDS);
});

describe('the stored v0.6 corpus', () => {
  it('is not empty, so nothing below can pass by finding no files', () => {
    expect(loaded.length).toBeGreaterThanOrEqual(9);
  });

  it('loads completely, with nothing unscoreable', () => {
    const failures = loaded
      .filter((entry) => !entry.load.ok)
      .map((entry) =>
        entry.load.ok
          ? ''
          : `${entry.file}: ${entry.load.reason} ${entry.load.detail}`,
      );
    expect(failures).toEqual([]);
  });

  it('summarizes as all loaded', () => {
    const summary = summarizeLoads(loaded);
    expect(summary.unscoreable).toBe(0);
    expect(summary.loaded).toBe(summary.total);
  });
});

describe('both stored shapes are present', () => {
  /**
   * This is the reason `maxTokens` and `typedArguments` are optional rather than an
   * oversight. If the corpus ever contains only one shape, the optionality has stopped
   * being justified by anything and this test says so.
   */
  function records() {
    return loaded.flatMap((entry) =>
      entry.load.ok ? [entry.load.record] : [],
    );
  }

  it('includes records written before the token budget existed', () => {
    const older = records().filter((record) => record.maxTokens === undefined);
    expect(older.length).toBeGreaterThan(0);
  });

  it('includes records written after it', () => {
    const newer = records().filter((record) => record.maxTokens !== undefined);
    expect(newer.length).toBeGreaterThan(0);
  });

  it('carries a model on every record', () => {
    // A score with no model attached says nothing about anything.
    expect(records().every((record) => record.model.length > 0)).toBe(true);
  });
});

describe('what the corpus actually contains', () => {
  /**
   * Recorded so the size of the starting dataset is a number in the suite rather than a
   * sentence in a document. Four findings across nine runs is the real input to v0.7, and
   * it is thinner than the prose in RUNS.md suggests — three more findings were
   * hand-checked there, but two came from a probe script that writes no record and one
   * was lost in transit before it could be stored.
   */
  it('holds four findings in total', () => {
    const total = loaded.reduce(
      (count, entry) =>
        count + (entry.load.ok ? entry.load.record.findings.length : 0),
      0,
    );
    expect(total).toBe(4);
  });

  it('holds findings from exactly two runs', () => {
    const withFindings = loaded.filter(
      (entry) => entry.load.ok && entry.load.record.findings.length > 0,
    );
    expect(withFindings).toHaveLength(2);
  });

  it('records no completed run', () => {
    // Every stored run ended in a failure code. Stated here so a future run that finally
    // reaches `complete` changes a test rather than passing unnoticed.
    const outcomes = loaded.flatMap((entry) =>
      entry.load.ok ? [entry.load.record.outcome] : [],
    );
    expect(outcomes).not.toContain('complete');
  });

  it('cannot tell why run 9 failed', () => {
    /**
     * RUNS.md records run 9 as a CONFIGURATION failure that never reached the network.
     * The stored record says DECISION_FAILED with zero calls, because the runner wraps
     * the provider's code before the script writes it down.
     *
     * So a configuration bug that cost nothing and a model producing ten steps of
     * confused output are the same word in the file. The only surviving clue is that
     * usage.calls is zero. This test pins the loss so it is a known gap rather than a
     * surprise, and closing it is its own task — it changes what gets written.
     */
    const zeroCall = loaded.filter(
      (entry) => entry.load.ok && entry.load.record.usage.calls === 0,
    );
    expect(zeroCall).toHaveLength(1);
    const record = zeroCall[0]?.load;
    if (!record?.ok) throw new Error('expected a loaded record');
    expect(record.record.outcome).toBe('DECISION_FAILED');
    expect(record.record.usage.totalTokens).toBe(0);
  });
});

describe('files that are not records', () => {
  let sandbox: string;

  beforeAll(async () => {
    sandbox = await mkdtemp(join(tmpdir(), 'run-records-'));
    await writeFile(join(sandbox, 'empty.json'), '');
    await writeFile(
      join(sandbox, 'truncated.json'),
      '{"runId":"abc","usage":{',
    );
    await writeFile(join(sandbox, 'wrong-shape.json'), '{"note":"not a run"}');
    await writeFile(join(sandbox, 'notes.txt'), 'ignored, not json');
  });

  afterAll(async () => {
    await rm(sandbox, { recursive: true, force: true });
  });

  it('reports a missing file without throwing, and names the system code', async () => {
    /**
     * The `ENOENT` assertion is the part that matters. The first version of the loader
     * read the code behind `error instanceof Error`, which is false inside this test
     * runner because Node's filesystem error is built in a different realm from the
     * runner's `Error`. A plain missing file reported `unknown`.
     *
     * The failure only appeared here. Run from a normal Node process it would have
     * worked, which is the kind of defect that survives until the day it matters.
     */
    const load = await loadRunRecord(join(sandbox, 'absent.json'));
    expect(load).toMatchObject({ ok: false, reason: 'unreadable_file' });
    if (!load.ok) expect(load.detail).toBe('ENOENT');
  });

  it('reports a directory as unreadable rather than crashing', async () => {
    const load = await loadRunRecord(sandbox);
    expect(load).toMatchObject({ ok: false, reason: 'unreadable_file' });
  });

  it('gives each broken file its own reason', async () => {
    const entries = await loadRunRecords(sandbox);
    const reasons = Object.fromEntries(
      entries.map((entry) => [
        entry.file,
        entry.load.ok ? 'loaded' : entry.load.reason,
      ]),
    );
    expect(reasons).toEqual({
      'empty.json': 'empty_file',
      'truncated.json': 'unparseable_json',
      'wrong-shape.json': 'schema_rejected',
    });
  });

  it('counts three unscoreable files and no successes', async () => {
    const summary = summarizeLoads(await loadRunRecords(sandbox));
    expect(summary).toEqual({ total: 3, loaded: 0, unscoreable: 3 });
  });

  it('does not report a broken file as a run that found nothing', async () => {
    // The distinction the whole design rests on. Zero findings and no record are
    // different facts, and an evaluation that writes both down as 0 is lying quietly.
    const entries = await loadRunRecords(sandbox);
    expect(entries.every((entry) => !entry.load.ok)).toBe(true);
  });
});

describe('one bad file does not hide the good ones', () => {
  let sandbox: string;

  beforeAll(async () => {
    sandbox = await mkdtemp(join(tmpdir(), 'run-records-mixed-'));
    const good = loaded.find((entry) => entry.load.ok);
    if (!good?.load.ok) throw new Error('expected a loadable record');
    await writeFile(
      join(sandbox, 'good.json'),
      JSON.stringify(good.load.record),
    );
    await writeFile(join(sandbox, 'bad.json'), 'not json at all');
  });

  afterAll(async () => {
    await rm(sandbox, { recursive: true, force: true });
  });

  it('returns the good record alongside the named failure', async () => {
    const summary = summarizeLoads(await loadRunRecords(sandbox));
    expect(summary).toEqual({ total: 2, loaded: 1, unscoreable: 1 });
  });
});
