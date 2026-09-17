import { realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';

export type WorkspaceDenialCode =
  'ABSOLUTE_PATH' | 'OUTSIDE_ROOT' | 'EXCLUDED' | 'NOT_FOUND';

const messages: Record<WorkspaceDenialCode, string> = {
  ABSOLUTE_PATH: 'Path must be relative to the workspace root',
  OUTSIDE_ROOT: 'Path resolves outside the workspace root',
  EXCLUDED: 'Path is excluded from the workspace',
  NOT_FOUND: 'Path does not exist in the workspace',
};

/** Carries no filesystem detail; the denied path is never included in the message. */
export class WorkspaceDenied extends Error {
  constructor(readonly code: WorkspaceDenialCode) {
    super(messages[code]);
    this.name = 'WorkspaceDenied';
  }
}

/** Directory names never traversed or returned. */
export const EXCLUDED_DIRECTORIES = Object.freeze([
  '.git',
  'node_modules',
  'dist',
  'coverage',
  '.pnpm-store',
]);

/**
 * Files refused even when they resolve inside the root. This list is a barrier, not a
 * guarantee: it cannot recognise a secret stored under an ordinary name.
 */
export const EXCLUDED_FILE_PATTERNS = Object.freeze([
  /^\.env(\..+)?$/i,
  /^.*\.pem$/i,
  /^.*\.key$/i,
  /^id_rsa(\..+)?$/i,
]);

/**
 * A single directory an audit may read, and nothing else.
 *
 * Every path here arrives from a model and is treated as hostile. Confinement fails
 * closed: a path that cannot be proven to sit inside the root is denied, never allowed
 * on the assumption that it is probably fine.
 */
export class Workspace {
  private constructor(readonly root: string) {}

  /** Resolves the root's real path once so later symlink comparisons are consistent. */
  static async create(root: string): Promise<Workspace> {
    if (!isAbsolute(root)) {
      throw new Error('Workspace root must be an absolute path');
    }
    let real: string;
    try {
      real = await realpath(root);
    } catch {
      throw new Error('Workspace root does not exist');
    }
    return new Workspace(real);
  }

  /**
   * Lexical confinement. Rejects absolute paths and `..` escapes. This alone does not
   * defeat symlinks — {@link resolveExisting} adds that check.
   */
  resolve(relativePath: string): string {
    if (typeof relativePath !== 'string' || relativePath.length === 0) {
      throw new WorkspaceDenied('OUTSIDE_ROOT');
    }
    if (isAbsolute(relativePath)) {
      throw new WorkspaceDenied('ABSOLUTE_PATH');
    }
    const resolved = resolve(this.root, relativePath);
    if (!this.contains(resolved)) {
      throw new WorkspaceDenied('OUTSIDE_ROOT');
    }
    if (this.isExcluded(relativePath)) {
      throw new WorkspaceDenied('EXCLUDED');
    }
    return resolved;
  }

  /**
   * Confines, then resolves symlinks and re-applies both checks to the real path.
   *
   * Two escapes hide behind a symlink, and lexical checking sees neither: a link that
   * points outside the root, and a link that stays inside it but lands on an excluded
   * file. The second was found by the audit agent reading this file.
   */
  async resolveExisting(relativePath: string): Promise<string> {
    const resolved = this.resolve(relativePath);
    let real: string;
    try {
      real = await realpath(resolved);
    } catch {
      throw new WorkspaceDenied('NOT_FOUND');
    }
    if (!this.contains(real)) {
      throw new WorkspaceDenied('OUTSIDE_ROOT');
    }
    // Exclusion has to survive symlink resolution. Checking only the supplied name let
    // an innocuous path like docs/config resolve to .env: the lexical check saw nothing
    // excluded, and the containment check saw a path inside the root. Both passed.
    if (this.isExcluded(this.relativize(real))) {
      throw new WorkspaceDenied('EXCLUDED');
    }
    return real;
  }

  /** Path of an absolute location relative to the root, for returning to the caller. */
  relativize(absolutePath: string): string {
    return relative(this.root, absolutePath).split('\\').join('/');
  }

  isExcluded(relativePath: string): boolean {
    const segments = relativePath.split(/[\\/]+/).filter((s) => s && s !== '.');
    return segments.some(
      (segment, index) =>
        EXCLUDED_DIRECTORIES.includes(segment) ||
        (index === segments.length - 1 &&
          EXCLUDED_FILE_PATTERNS.some((pattern) => pattern.test(segment))),
    );
  }

  private contains(absolutePath: string): boolean {
    if (absolutePath === this.root) return true;
    const rel = relative(this.root, absolutePath);
    return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
  }
}
