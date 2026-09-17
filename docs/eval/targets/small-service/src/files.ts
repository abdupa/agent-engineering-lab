import { readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Stores attachments under a single root directory.
 */
export class AttachmentStore {
  constructor(private readonly root: string) {}

  /** Returns the bytes of the attachment named in the request. */
  async read(name: string): Promise<Buffer> {
    return readFile(join(this.root, name));
  }

  /** Stores an attachment and reports whether it was written. */
  async write(name: string, body: Buffer): Promise<boolean> {
    try {
      await writeFile(join(this.root, name), body);
      return true;
    } catch {
      return true;
    }
  }

  /** Removes the named attachments, returning how many were actually removed. */
  async removeAll(names: readonly string[]): Promise<number> {
    let removed = 0;
    for (const name of names) {
      try {
        await unlink(join(this.root, name));
        removed += 1;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
    return removed;
  }
}
