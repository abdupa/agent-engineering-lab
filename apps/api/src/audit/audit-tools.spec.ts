import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ToolRegistry } from '../tools/tool-registry';
import { ToolExecutor } from '../tools/tool-executor';
import { ToolExecutionError } from '../tools/tool-execution.error';
import { createGrepTool } from './grep.tool';
import { createListFilesTool } from './list-files.tool';
import { createReadFileTool } from './read-file.tool';
import { Workspace, WorkspaceDenied } from './workspace';
import type { GrepOutput } from './grep.tool';
import type { ListFilesOutput } from './list-files.tool';
import type { ReadFileOutput } from './read-file.tool';

const GRANTED = { grantedPermissions: ['audit:read'] };

let sandbox: string;
let root: string;
let outside: string;
let workspace: Workspace;
let executor: ToolExecutor;

beforeAll(async () => {
  sandbox = await mkdtemp(join(tmpdir(), 'audit-tools-'));
  root = join(sandbox, 'root');
  outside = join(sandbox, 'outside');

  await mkdir(join(root, 'src', 'nested'), { recursive: true });
  await mkdir(join(root, 'node_modules', 'pkg'), { recursive: true });
  await mkdir(join(root, '.git'), { recursive: true });
  await mkdir(outside, { recursive: true });

  await writeFile(join(root, 'README.md'), '# Fixture\nhello world\n');
  await writeFile(
    join(root, 'src', 'a.ts'),
    "export const a = 1;\nconsole.log('needle');\n",
  );
  await writeFile(join(root, 'src', 'nested', 'b.ts'), '// NEEDLE here\n');
  await writeFile(join(root, '.env'), 'SECRET=do-not-read\n');
  await writeFile(join(root, 'server.key'), 'PRIVATE KEY\n');
  await writeFile(join(root, 'node_modules', 'pkg', 'index.js'), 'needle\n');
  await writeFile(join(root, '.git', 'config'), 'needle\n');
  await writeFile(join(root, 'bin.dat'), Buffer.from([0x41, 0x00, 0x42]));
  await writeFile(join(outside, 'secret.txt'), 'exfiltrated\n');

  await symlink(join(outside, 'secret.txt'), join(root, 'link-out'));
  await symlink(join(root, 'README.md'), join(root, 'link-in'));

  workspace = await Workspace.create(root);
  const registry = new ToolRegistry();
  registry.register(createListFilesTool(workspace));
  registry.register(createReadFileTool(workspace));
  registry.register(createGrepTool(workspace));
  executor = new ToolExecutor(registry);
});

afterAll(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

describe('Workspace confinement', () => {
  it('requires an absolute existing root', async () => {
    await expect(Workspace.create('relative/path')).rejects.toThrow(
      'Workspace root must be an absolute path',
    );
    await expect(Workspace.create(join(root, 'missing'))).rejects.toThrow(
      'Workspace root does not exist',
    );
  });

  it('rejects an absolute path', () => {
    expect(() => workspace.resolve('/etc/passwd')).toThrow(WorkspaceDenied);
    try {
      workspace.resolve('/etc/passwd');
    } catch (error) {
      expect((error as WorkspaceDenied).code).toBe('ABSOLUTE_PATH');
    }
  });

  it.each([
    ['../outside/secret.txt'],
    ['src/../../outside/secret.txt'],
    ['./../../etc/passwd'],
    ['src/nested/../../../outside/secret.txt'],
  ])('rejects the traversal %s', (attempt) => {
    expect(() => workspace.resolve(attempt)).toThrow(WorkspaceDenied);
  });

  it.each([
    ['.env'],
    ['.env.local'],
    ['server.key'],
    ['certs/tls.pem'],
    ['.git/config'],
    ['node_modules/pkg/index.js'],
    ['src/../node_modules/pkg/index.js'],
  ])('refuses the excluded path %s', (attempt) => {
    expect(() => workspace.resolve(attempt)).toThrow(WorkspaceDenied);
  });

  it('allows an ordinary path inside the root', () => {
    expect(workspace.resolve('src/a.ts')).toBe(
      join(workspace.root, 'src/a.ts'),
    );
  });

  it('rejects a symlink that escapes the root, which lexical checking cannot see', async () => {
    // The lexical check passes: "link-out" contains no traversal.
    expect(() => workspace.resolve('link-out')).not.toThrow();
    // Resolving the link is what catches it.
    await expect(workspace.resolveExisting('link-out')).rejects.toMatchObject({
      code: 'OUTSIDE_ROOT',
    });
  });

  it('allows a symlink that stays inside the root', async () => {
    await expect(workspace.resolveExisting('link-in')).resolves.toBe(
      join(workspace.root, 'README.md'),
    );
  });

  it('reports a missing path as not found', async () => {
    await expect(workspace.resolveExisting('nope.ts')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

describe('list-files through the executor', () => {
  it('lists workspace files and omits excluded trees', async () => {
    const result = (await executor.execute(
      'list-files',
      {},
      GRANTED,
    )) as ListFilesOutput;

    expect(result.files).toContain('README.md');
    expect(result.files).toContain('src/a.ts');
    expect(result.files).toContain('src/nested/b.ts');
    expect(result.files.some((f) => f.startsWith('node_modules'))).toBe(false);
    expect(result.files.some((f) => f.startsWith('.git'))).toBe(false);
    expect(result.files).not.toContain('.env');
    expect(result.files).not.toContain('server.key');
    expect(result.truncated).toBe(false);
  });

  it('does not follow symlinks while walking', async () => {
    const result = (await executor.execute(
      'list-files',
      {},
      GRANTED,
    )) as ListFilesOutput;
    expect(result.files).not.toContain('link-out');
    expect(result.files).not.toContain('link-in');
  });

  it('honours maxDepth', async () => {
    const result = (await executor.execute(
      'list-files',
      { maxDepth: 1 },
      GRANTED,
    )) as ListFilesOutput;
    expect(result.files).toContain('README.md');
    expect(result.files).not.toContain('src/a.ts');
  });

  it('reports truncation rather than silently dropping results', async () => {
    const result = (await executor.execute(
      'list-files',
      { limit: 1 },
      GRANTED,
    )) as ListFilesOutput;
    expect(result.files).toHaveLength(1);
    expect(result.truncated).toBe(true);
  });

  it('returns deterministic order across runs', async () => {
    const first = (await executor.execute(
      'list-files',
      {},
      GRANTED,
    )) as ListFilesOutput;
    const second = (await executor.execute(
      'list-files',
      {},
      GRANTED,
    )) as ListFilesOutput;
    expect(first.files).toEqual(second.files);
  });
});

describe('read-file through the executor', () => {
  it('reads a text file inside the workspace', async () => {
    const result = (await executor.execute(
      'read-file',
      { path: 'README.md' },
      GRANTED,
    )) as ReadFileOutput;
    expect(result.content).toBe('# Fixture\nhello world\n');
    expect(result.truncated).toBe(false);
    expect(result.bytes).toBe(22);
  });

  it('truncates to the byte budget and says so', async () => {
    const result = (await executor.execute(
      'read-file',
      { path: 'README.md', maxBytes: 9 },
      GRANTED,
    )) as ReadFileOutput;
    expect(result.content).toBe('# Fixture');
    expect(result.truncated).toBe(true);
    expect(result.bytes).toBe(22);
  });

  it.each([
    ['.env'],
    ['server.key'],
    ['../outside/secret.txt'],
    ['/etc/passwd'],
    ['link-out'],
    ['bin.dat'],
    ['missing.ts'],
  ])('refuses %s with a normalized failure', async (path) => {
    await expect(
      executor.execute('read-file', { path }, GRANTED),
    ).rejects.toBeInstanceOf(ToolExecutionError);
  });

  it('never leaks the workspace root in the returned path', async () => {
    const result = (await executor.execute(
      'read-file',
      { path: 'src/a.ts' },
      GRANTED,
    )) as ReadFileOutput;
    expect(result.path).toBe('src/a.ts');
    expect(result.path).not.toContain(workspace.root);
  });
});

describe('grep through the executor', () => {
  it('finds literal text with file and line number', async () => {
    const result = (await executor.execute(
      'grep',
      { query: 'needle' },
      GRANTED,
    )) as GrepOutput;
    expect(result.matches).toContainEqual({
      path: 'src/a.ts',
      line: 2,
      text: "console.log('needle');",
    });
  });

  it('is case-insensitive by default and case-sensitive on request', async () => {
    const insensitive = (await executor.execute(
      'grep',
      { query: 'needle' },
      GRANTED,
    )) as GrepOutput;
    expect(insensitive.matches.map((m) => m.path)).toContain('src/nested/b.ts');

    const sensitive = (await executor.execute(
      'grep',
      { query: 'needle', caseSensitive: true },
      GRANTED,
    )) as GrepOutput;
    expect(sensitive.matches.map((m) => m.path)).not.toContain(
      'src/nested/b.ts',
    );
  });

  it('never searches excluded trees', async () => {
    const result = (await executor.execute(
      'grep',
      { query: 'needle' },
      GRANTED,
    )) as GrepOutput;
    expect(result.matches.some((m) => m.path.startsWith('node_modules'))).toBe(
      false,
    );
    expect(result.matches.some((m) => m.path.startsWith('.git'))).toBe(false);
  });

  it('treats a regex-looking query as literal text', async () => {
    // ".*" matches everything as a pattern and nothing as a substring here.
    const result = (await executor.execute(
      'grep',
      { query: '.*' },
      GRANTED,
    )) as GrepOutput;
    expect(result.matches).toEqual([]);
  });

  it('caps results and reports truncation', async () => {
    const result = (await executor.execute(
      'grep',
      { query: 'e', limit: 2 },
      GRANTED,
    )) as GrepOutput;
    expect(result.matches).toHaveLength(2);
    expect(result.truncated).toBe(true);
  });

  it('rejects an empty query at the schema boundary', async () => {
    await expect(
      executor.execute('grep', { query: '' }, GRANTED),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });
});

describe('permission boundary', () => {
  it.each([['list-files'], ['read-file'], ['grep']])(
    'denies %s without audit:read, before parsing input',
    async (tool) => {
      await expect(
        executor.execute(tool, { path: 'README.md', query: 'x' }, undefined),
      ).rejects.toMatchObject({ code: 'DENIED' });
      await expect(
        executor.execute(
          tool,
          { path: 'README.md', query: 'x' },
          {
            grantedPermissions: ['calculate'],
          },
        ),
      ).rejects.toMatchObject({ code: 'DENIED' });
    },
  );

  it('denies an invalid path without a permission grant, so denial precedes validation', async () => {
    // Even a request that would fail validation is denied first: the model learns
    // nothing about the filesystem from an unauthorised call.
    await expect(
      executor.execute('read-file', { path: '/etc/passwd' }, undefined),
    ).rejects.toMatchObject({ code: 'DENIED' });
  });
});

describe('an empty path means the workspace root', () => {
  // Found by a live run. Under strict Structured Outputs the model must supply every
  // property, so `.default()` never fires for model-supplied input; it sent "" and the
  // tool failed at execution instead of resolving the root.
  it.each([['list-files'], ['grep']])(
    '%s treats an empty path as the root rather than failing',
    async (tool) => {
      await expect(
        executor.execute(tool, { path: '', query: 'hello' }, GRANTED),
      ).resolves.toBeDefined();
    },
  );

  it.each([['list-files'], ['grep']])(
    '%s treats a whitespace path as the root',
    async (tool) => {
      await expect(
        executor.execute(tool, { path: '   ', query: 'hello' }, GRANTED),
      ).resolves.toBeDefined();
    },
  );

  it('still refuses an empty path where no root default applies', async () => {
    // read-file names one file; there is no sensible default, so empty stays invalid.
    await expect(
      executor.execute('read-file', { path: '' }, GRANTED),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });
});
