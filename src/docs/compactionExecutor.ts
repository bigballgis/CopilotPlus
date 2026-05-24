/** Apply approved compaction plans — R-DOCS-9.4 */

import type { AppServices } from '../app/appServices';
import type { CompactionPlanItem } from './compactionPlan';
import { composeDocument } from './frontmatterSerialize';

export async function executeCompactionPlan(
  app: AppServices,
  items: CompactionPlanItem[]
): Promise<number> {
  if (items.length === 0) {
    return 0;
  }

  const snapshots: Array<{ relative: string; content: string }> = [];
  for (const item of items) {
    const entry = app.docs.getByPath(item.documentPath);
    if (!entry) {
      continue;
    }
    snapshots.push({
      relative: item.documentPath.replace(/^\.\//, ''),
      content: await app.docs.readRaw(item.documentPath),
    });
    if (item.action === 'merge_into_parent') {
      const parentPath = item.parentPath ?? resolveParentPath(entry, app.docs.getEntries());
      if (parentPath) {
        snapshots.push({
          relative: parentPath.replace(/^\.\//, ''),
          content: await app.docs.readRaw(parentPath),
        });
      }
    }
  }

  await app.checkpoints.recordPreEdit(snapshots, 'document compaction');

  let applied = 0;
  for (const item of items) {
    switch (item.action) {
      case 'archive':
        await app.docs.archiveDocument(item.documentPath);
        applied += 1;
        break;
      case 'merge_into_parent':
        if (await mergeIntoParent(app, item)) {
          applied += 1;
        }
        break;
      case 'delete':
        await app.docs.deleteDocument(item.documentPath);
        applied += 1;
        break;
      default:
        break;
    }
  }

  if (applied > 0) {
    await app.indexManager.rebuildAll();
  }
  return applied;
}

async function mergeIntoParent(app: AppServices, item: CompactionPlanItem): Promise<boolean> {
  const child = app.docs.getByPath(item.documentPath);
  if (!child) {
    return false;
  }
  const parentPath = item.parentPath ?? resolveParentPath(child, app.docs.getEntries());
  if (!parentPath) {
    return false;
  }
  const parent = app.docs.getByPath(parentPath);
  if (!parent) {
    return false;
  }

  const mergedBody = `${parent.body.trim()}\n\n## Merged from ${child.frontmatter.title}\n${child.body.trim()}\n`;
  const parentFm = {
    ...parent.frontmatter,
    children: (parent.frontmatter.children ?? []).filter((id) => id !== child.frontmatter.id),
  };
  await app.docs.writeRaw(parentPath, composeDocument(parentFm, mergedBody));
  await app.docs.archiveDocument(item.documentPath);
  await app.docs.scan();
  return true;
}

function resolveParentPath(
  child: { frontmatter: { parent?: string } },
  entries: ReturnType<AppServices['docs']['getEntries']>
): string | undefined {
  const parentId = child.frontmatter.parent;
  if (!parentId) {
    return undefined;
  }
  return entries.find((e) => e.valid && e.frontmatter.id === parentId)?.relativePath;
}
