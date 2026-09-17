import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Three documents number the releases: ROADMAP.md schedules them, CROSS_CUTTING.md names
 * the new reliability and observability surface each one introduces, and CURRENT.md says
 * which is active. They drifted apart twice on the same day.
 *
 * The first time, ROADMAP still listed v0.6 as Memory after the SPEC and CURRENT had
 * moved it to the first agent. The second time, the reorder putting Evaluation at v0.7
 * was written as prose directly underneath a table that still said "Second agent" — the
 * note and the rows it described disagreed, in the same file, in the same commit.
 *
 * Both were found by a human reading two documents side by side, which is not a check
 * anyone performs reliably and is therefore not a check.
 */

const repoRoot = resolve(__dirname, '../../../..');
const docs = join(repoRoot, 'docs');
const releases = join(docs, 'releases');

/** Releases closed under the predecessor's rules; their records are not edited. */
const ARCHIVED = new Set(['v0.1', 'v0.2', 'v0.3', 'v0.4', 'v0.5']);

/** Same release under two spellings is the same release. Whitespace and case are noise. */
function normalize(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** `| 2   | **v0.7 — Evaluation** | ... |` from the scheduled table. */
function roadmapReleases(): Map<string, string> {
  const body = readFileSync(join(docs, 'ROADMAP.md'), 'utf8');
  const found = new Map<string, string>();
  for (const match of body.matchAll(
    /^\|\s*\d+\s*\|\s*\*\*(v\d+\.\d+)\s*—\s*([^*]+?)\*\*/gm,
  )) {
    found.set(match[1] as string, normalize(match[2] as string));
  }
  return found;
}

/** `| v0.7 Evaluation | ... | ... |` from the new-surface table. */
function crossCuttingReleases(): Map<string, string> {
  const body = readFileSync(join(docs, 'CROSS_CUTTING.md'), 'utf8');
  const found = new Map<string, string>();
  for (const match of body.matchAll(/^\|\s*(v\d+\.\d+)\s+([^|]+?)\s*\|/gm)) {
    found.set(match[1] as string, normalize(match[2] as string));
  }
  return found;
}

function releaseDirs(): string[] {
  if (!existsSync(releases)) return [];
  return readdirSync(releases, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== '_template')
    .map((entry) => entry.name)
    .filter((name) => !ARCHIVED.has(name))
    .sort();
}

describe('governance: the three documents agree on the release numbering', () => {
  const roadmap = roadmapReleases();
  const crossCutting = crossCuttingReleases();

  it('ROADMAP.md has a parseable scheduled table', () => {
    // If the table's shape changes, every assertion below would pass vacuously.
    expect(roadmap.size).toBeGreaterThanOrEqual(10);
    expect(roadmap.get('v0.6')).toBe('first agent');
  });

  it('CROSS_CUTTING.md has a parseable surface table', () => {
    expect(crossCutting.size).toBeGreaterThanOrEqual(10);
  });

  it('every release in CROSS_CUTTING.md is scheduled in ROADMAP.md under the same name', () => {
    const disagreements: string[] = [];
    for (const [release, name] of crossCutting) {
      const scheduled = roadmap.get(release);
      if (scheduled === undefined) {
        disagreements.push(`${release} "${name}" is not in the roadmap at all`);
      } else if (scheduled !== name) {
        disagreements.push(
          `${release}: roadmap says "${scheduled}", cross-cutting says "${name}"`,
        );
      }
    }
    expect(disagreements).toEqual([]);
  });

  it('every scheduled release names its new cross-cutting surface', () => {
    // A release with no row in CROSS_CUTTING.md is one whose reliability and
    // observability surface nobody stated. That is the drift the document exists to stop.
    const missing = [...roadmap.keys()].filter(
      (release) => !crossCutting.has(release),
    );
    expect(missing).toEqual([]);
  });
});

describe('governance: CURRENT.md names a release the roadmap schedules', () => {
  const current = readFileSync(join(docs, 'CURRENT.md'), 'utf8');
  const line = /^Release:\s*(v\d+\.\d+)\s*—\s*(.+)$/m.exec(current);

  it('states a release with a version and a name', () => {
    expect(line).not.toBeNull();
  });

  it('matches the roadmap row for that version', () => {
    if (!line) throw new Error('CURRENT.md has no parseable Release line');
    const [, version, name] = line as unknown as [string, string, string];
    expect(roadmapReleases().get(version)).toBe(normalize(name));
  });

  it('has a SPEC for the release it names', () => {
    if (!line) throw new Error('CURRENT.md has no parseable Release line');
    const version = line[1] as string;
    expect(existsSync(join(releases, version, 'SPEC.md'))).toBe(true);
  });
});

describe('governance: every active release directory is on the roadmap', () => {
  const roadmap = roadmapReleases();
  const dirs = releaseDirs();

  it('lists the directories being checked', () => {
    expect(dirs.length).toBeGreaterThan(0);
  });

  it.each(dirs.map((d) => [d] as const))(
    'docs/releases/%s is scheduled',
    (release) => {
      // Work that exists on disk but nowhere in the plan is the other direction of the
      // same drift, and it is how a release gets built that nobody agreed to.
      expect(roadmap.has(release)).toBe(true);
    },
  );
});
