import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ToolRegistry } from '../tools/tool-registry';
import { ToolExecutor } from '../tools/tool-executor';
import { createReadFileTool } from './read-file.tool';
import { Workspace } from './workspace';
import type { ReadFileOutput } from './read-file.tool';

/**
 * Both defects here were found by the audit agent itself, auditing this directory, on
 * its first successful report against code nobody had marked up.
 *
 * The existing suite missed both: it tested a symlink pointing OUTSIDE the root, never
 * one pointing at an excluded file INSIDE it, and it asserted what read-file returns
 * without ever asking what it reads.
 */

const GRANTED = { grantedPermissions: ['audit:read'] };

let sandbox: string;
let workspace: Workspace;
let executor: ToolExecutor;

beforeAll(async () => {
  sandbox = await mkdtemp(join(tmpdir(), 'agent-found-'));
  await mkdir(join(sandbox, 'docs'), { recursive: true });
  await writeFile(join(sandbox, '.env'), 'SECRET=must-not-be-readable\n');
  await writeFile(join(sandbox, 'server.key'), 'PRIVATE KEY MATERIAL\n');
  await writeFile(join(sandbox, 'big.txt'), 'x'.repeat(2_000_000));
  await writeFile(join(sandbox, 'docs', 'small.txt'), 'short file\n');

  // An innocuous name inside the workspace pointing at an excluded file.
  await symlink(join(sandbox, '.env'), join(sandbox, 'docs', 'config'));
  await symlink(join(sandbox, 'server.key'), join(sandbox, 'docs', 'notes.md'));

  workspace = await Workspace.create(sandbox);
  const registry = new ToolRegistry();
  registry.register(createReadFileTool(workspace));
  executor = new ToolExecutor(registry);
});

afterAll(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

describe('a symlink inside the workspace pointing at an excluded file', () => {
  it.each([
    ['docs/config', '.env'],
    ['docs/notes.md', 'server.key'],
  ])('refuses %s even though only its target %s is excluded', async (link) => {
    // The lexical name is not excluded and the real path is inside the root, so the
    // two checks that existed both pass. Exclusion has to survive symlink resolution.
    await expect(workspace.resolveExisting(link)).rejects.toMatchObject({
      code: 'EXCLUDED',
    });
  });

  it('does not hand the secret back through read-file', async () => {
    await expect(
      executor.execute('read-file', { path: 'docs/config' }, GRANTED),
    ).rejects.toMatchObject({ code: 'EXECUTION_FAILED' });
  });
});

describe('the byte budget bounds what is read, not only what is returned', () => {
  it('never loads more than the budget plus one byte into memory', async () => {
    const before = process.memoryUsage().arrayBuffers;
    const result = (await executor.execute(
      'read-file',
      { path: 'big.txt', maxBytes: 1_000 },
      GRANTED,
    )) as ReadFileOutput;
    const after = process.memoryUsage().arrayBuffers;

    expect(result.content).toHaveLength(1_000);
    expect(result.truncated).toBe(true);
    // Reported size stays honest: the whole file is 2 MB even though 1 KB was read.
    expect(result.bytes).toBe(2_000_000);
    // Reading a 2 MB file behind a 1 KB budget must not allocate megabytes.
    expect(after - before).toBeLessThan(500_000);
  });

  it('still reads a short file whole when the budget allows', async () => {
    const result = (await executor.execute(
      'read-file',
      { path: 'docs/small.txt', maxBytes: 10_000 },
      GRANTED,
    )) as ReadFileOutput;
    expect(result.content).toBe('short file\n');
    expect(result.bytes).toBe(11);
    expect(result.truncated).toBe(false);
  });

  it('rejects a budget above the schema ceiling rather than honouring it', async () => {
    await expect(
      executor.execute(
        'read-file',
        { path: 'big.txt', maxBytes: 3_000_000 },
        GRANTED,
      ),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });
});
