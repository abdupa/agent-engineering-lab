import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Governance rules are enforced here rather than in CLAUDE.md alone, because a rule
// that depends on a document being in context is skipped the moment it is not.
// This runs inside `pnpm test`, so it rides on `pnpm verify` and fails the gate.

const repoRoot = resolve(__dirname, '../../../..');
const docs = join(repoRoot, 'docs');
const releases = join(docs, 'releases');

// v0.1-v0.5 closed under the predecessor's rules. Their records are evidence and are
// not edited retrospectively; the template is checked separately below.
const ARCHIVED = new Set(['v0.1', 'v0.2', 'v0.3', 'v0.4', 'v0.5']);

const REQUIRED_SPEC_SECTIONS = [
  { name: 'earning requirement', pattern: /##\s*The product requirement that earns this release/i },
  { name: 'reliability policy', pattern: /##\s*Reliability policy/i },
  { name: 'observability', pattern: /##\s*Observability/i },
  { name: 'what this will not prove', pattern: /##\s*What this will not prove/i },
];

function releaseDirs(): string[] {
  if (!existsSync(releases)) return [];
  return readdirSync(releases, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== '_template')
    .map((entry) => entry.name)
    .filter((name) => !ARCHIVED.has(name))
    .sort();
}

function specPath(release: string): string {
  return join(releases, release, 'SPEC.md');
}

describe('governance: required documents exist', () => {
  it.each([
    ['CLAUDE.md', join(repoRoot, 'CLAUDE.md')],
    ['docs/CHARTER.md', join(docs, 'CHARTER.md')],
    ['docs/PATTERNS.md', join(docs, 'PATTERNS.md')],
    ['docs/ROADMAP.md', join(docs, 'ROADMAP.md')],
    ['docs/CROSS_CUTTING.md', join(docs, 'CROSS_CUTTING.md')],
    ['docs/DECISION_POLICY.md', join(docs, 'DECISION_POLICY.md')],
    ['docs/CURRENT.md', join(docs, 'CURRENT.md')],
  ])('%s is present', (_label, path) => {
    expect(existsSync(path)).toBe(true);
  });
});

describe('governance: the SPEC template carries every required section', () => {
  const template = join(releases, '_template', 'SPEC.md');

  it('exists', () => {
    expect(existsSync(template)).toBe(true);
  });

  it.each(REQUIRED_SPEC_SECTIONS.map((s) => [s.name, s.pattern] as const))(
    'declares %s',
    (_name, pattern) => {
      expect(readFileSync(template, 'utf8')).toMatch(pattern);
    },
  );
});

describe('governance: every active release SPEC is complete', () => {
  const active = releaseDirs();

  it('lists the releases being checked', () => {
    // Informational: an empty list is valid before v0.6 starts, but it must be
    // visible that nothing was checked rather than silently passing.
    expect(Array.isArray(active)).toBe(true);
  });

  describe.each(active.length ? active : [['(none yet)'] as unknown as string])(
    'release %s',
    (release: string) => {
      if (release === '(none yet)') {
        it('no active releases to check', () => {
          expect(active).toHaveLength(0);
        });
        return;
      }

      it('has a SPEC.md', () => {
        expect(existsSync(specPath(release))).toBe(true);
      });

      it.each(REQUIRED_SPEC_SECTIONS.map((s) => [s.name, s.pattern] as const))(
        'states its %s',
        (name, pattern) => {
          const path = specPath(release);
          if (!existsSync(path)) throw new Error(`${release}/SPEC.md is missing`);
          const body = readFileSync(path, 'utf8');
          if (!pattern.test(body)) {
            throw new Error(
              `${release}/SPEC.md is missing its "${name}" section. ` +
                `Copy docs/releases/_template/SPEC.md — see docs/CROSS_CUTTING.md.`,
            );
          }
          expect(pattern.test(body)).toBe(true);
        },
      );

      it('fills in the earning requirement rather than leaving the placeholder', () => {
        const body = readFileSync(specPath(release), 'utf8');
        const section = /##\s*The product requirement that earns this release\s*([\s\S]*?)(?=\n##\s|$)/i.exec(
          body,
        );
        expect(section).not.toBeNull();
        const text = (section?.[1] ?? '').trim();
        // A template placeholder is angle-bracketed; real prose is not.
        expect(text.startsWith('<')).toBe(false);
        expect(text.length).toBeGreaterThan(40);
      });
    },
  );
});

describe('governance: CURRENT.md names the active work', () => {
  const current = readFileSync(join(docs, 'CURRENT.md'), 'utf8');

  it.each([
    ['a release', /^Release:\s*\S+/m],
    ['a current task', /^Current task:\s*\S+/m],
    ['a status', /^Status:\s*\S+/m],
  ])('names %s', (_label, pattern) => {
    expect(current).toMatch(pattern);
  });
});

describe('governance: links in the governance documents resolve', () => {
  // Scoped to the documents written under the current rules. Archived release
  // records keep their broken links deliberately — repointing them would edit
  // a record of what was true when it was written.
  const governed = [
    join(repoRoot, 'CLAUDE.md'),
    join(repoRoot, 'README.md'),
    join(docs, 'CHARTER.md'),
    join(docs, 'PATTERNS.md'),
    join(docs, 'ROADMAP.md'),
    join(docs, 'CROSS_CUTTING.md'),
    join(docs, 'CURRENT.md'),
    join(docs, 'DECISION_POLICY.md'),
  ];

  it.each(governed.map((p) => [p.slice(repoRoot.length + 1), p] as const))(
    '%s',
    (label, path) => {
      const body = readFileSync(path, 'utf8');
      const dir = resolve(path, '..');
      const broken: string[] = [];
      for (const match of body.matchAll(/\]\((?!https?:|#)([^)\s]+)\)/g)) {
        const target = (match[1] ?? '').split('#')[0];
        if (!target) continue;
        if (!existsSync(resolve(dir, target))) broken.push(target);
      }
      if (broken.length) {
        throw new Error(`${label} links to missing files: ${broken.join(', ')}`);
      }
      expect(broken).toEqual([]);
    },
  );
});
