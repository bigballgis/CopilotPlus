/** @folder mention helpers — R-CTX-1.4 */

import * as fs from 'fs/promises';
import * as path from 'path';

export async function listFolderFiles(
  workspaceRoot: string,
  folderRel: string,
  maxFiles = 1000
): Promise<string[]> {
  const base = path.join(workspaceRoot, folderRel);
  const files: string[] = [];

  async function walk(dir: string, relBase: string): Promise<void> {
    if (files.length >= maxFiles) {
      return;
    }
    let entries: string[];
    try {
      entries = await fs.readdir(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      if (files.length >= maxFiles) {
        return;
      }
      if (name === 'node_modules' || name === '.git') {
        continue;
      }
      const abs = path.join(dir, name);
      const rel = relBase ? path.join(relBase, name) : name;
      const stat = await fs.stat(abs).catch(() => undefined);
      if (!stat) {
        continue;
      }
      if (stat.isDirectory()) {
        await walk(abs, rel);
      } else {
        files.push(rel.replace(/\\/g, '/'));
      }
    }
  }

  await walk(base, folderRel.replace(/\\/g, '/'));
  return files;
}
