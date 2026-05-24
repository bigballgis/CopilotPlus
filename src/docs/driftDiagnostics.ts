/** Static drift diagnostics — R-DOCS-12, R-DOCS-13 */

import type { DocEntry } from './documentTreeService';
import { resolveOwners } from './ownershipIndex';
import { extractSummaryText, hasSummarySection, isSummaryLengthValid } from './summarySection';
import type { DriftItem, DriftType, LayerConsistencyCounts } from './driftTypes';

export { hasSummarySection } from './summarySection';

export function scanDriftDiagnostics(
  entries: DocEntry[],
  codePaths: string[],
  stalePaths: Set<string>,
  now = Date.now()
): DriftItem[] {
  const items: DriftItem[] = [];
  const validIds = new Set(entries.filter((e) => e.valid).map((e) => e.frontmatter.id));
  const ts = new Date(now).toISOString();

  for (const entry of entries) {
    if (!entry.valid) {
      continue;
    }
    const layer = entry.frontmatter.level;
    const fm = entry.frontmatter;

    if (layer !== 'system' && fm.parent && !validIds.has(fm.parent)) {
      items.push(makeItem('Dangling_Link', layer, entry.relativePath, `Missing parent id: ${fm.parent}`, ts));
    }
    for (const childId of fm.children ?? []) {
      if (!validIds.has(childId)) {
        items.push(makeItem('Dangling_Link', layer, entry.relativePath, `Missing child id: ${childId}`, ts));
      }
    }
    for (const link of fm.lateral ?? []) {
      if (!validIds.has(link.target)) {
        items.push(
          makeItem('Dangling_Link', layer, entry.relativePath, `Missing lateral target: ${link.target}`, ts)
        );
      }
    }

    if (layer !== 'system') {
      if (!hasSummarySection(entry.body)) {
        items.push(makeItem('Missing_Summary', layer, entry.relativePath, undefined, ts));
      } else {
        const summaryLen = extractSummaryText(entry.body).length;
        if (!isSummaryLengthValid(extractSummaryText(entry.body))) {
          items.push(
            makeItem(
              'Missing_Summary',
              layer,
              entry.relativePath,
              `Summary length ${summaryLen} (need 100–800 chars)`,
              ts
            )
          );
        }
      }
    }

    if (stalePaths.has(entry.relativePath)) {
      items.push(makeItem('Stale_Summary', layer, entry.relativePath, undefined, ts));
    }

    if (layer === 'component' && !fm.placeholder) {
      const patterns = fm.code_paths ?? [];
      if (patterns.length > 0 && codePaths.length > 0) {
        const anyMatch = codePaths.some((file) => patterns.some((p) => matchSimpleGlob(p, file)));
        if (!anyMatch) {
          items.push(
            makeItem(
              'Code_Mismatch_Suspected',
              layer,
              entry.relativePath,
              'code_paths match no indexed files',
              ts
            )
          );
        }
      }
    }
  }

  const seenOrphans = new Set<string>();
  const seenConflicts = new Set<string>();
  for (const file of codePaths) {
    const ownership = resolveOwners(file, entries);
    if (ownership.orphan && !seenOrphans.has(file)) {
      seenOrphans.add(file);
      items.push(makeItem('Orphan_Code', 'code', file, undefined, ts));
    }
    if (ownership.conflict && !seenConflicts.has(file)) {
      seenConflicts.add(file);
      items.push(
        makeItem(
          'Ownership_Conflict',
          'code',
          file,
          `Owners: ${ownership.owners.join(', ')}`,
          ts
        )
      );
    }
  }

  return dedupeDriftItems(items);
}

export function summarizeLayerConsistency(
  items: DriftItem[],
  pendingQueueCount: number
): LayerConsistencyCounts {
  let driftSuspected = 0;
  let orphanCode = 0;
  let ownershipConflict = 0;
  let updatePending = 0;

  for (const item of items) {
    switch (item.type) {
      case 'Code_Mismatch_Suspected':
        driftSuspected += 1;
        break;
      case 'Orphan_Code':
        orphanCode += 1;
        break;
      case 'Ownership_Conflict':
        ownershipConflict += 1;
        break;
      case 'Doc_Update_Recommended':
      case 'Stale_Summary':
      case 'Missing_Summary':
      case 'Dangling_Link':
        updatePending += 1;
        break;
      default:
        break;
    }
  }

  const issueCount = driftSuspected + orphanCode + ownershipConflict + updatePending;
  return {
    consistent: Math.max(0, issueCount === 0 ? 1 : 0),
    updatePending,
    driftSuspected,
    orphanCode,
    ownershipConflict,
    pendingQueue: pendingQueueCount,
  };
}

export function driftItemKey(item: Pick<DriftItem, 'type' | 'target'>): string {
  return `${item.type}:${item.target}`;
}

export function dedupeDriftItems(items: DriftItem[]): DriftItem[] {
  const map = new Map<string, DriftItem>();
  for (const item of items) {
    map.set(driftItemKey(item), item);
  }
  return [...map.values()];
}

const AGENT_DETAIL_PREFIX = 'agent:';

/** Preserve Reviewer/Architect agent drift items when merging static scan results */
export function mergeDriftScanResults(
  scanned: DriftItem[],
  existing: DriftItem[],
  isDismissed: (item: DriftItem) => boolean
): DriftItem[] {
  const agentItems = existing.filter((item) => item.detail?.startsWith(AGENT_DETAIL_PREFIX));
  return dedupeDriftItems([
    ...scanned.filter((item) => !isDismissed(item)),
    ...agentItems.filter((item) => !isDismissed(item)),
  ]);
}

export function createDriftItem(
  type: DriftType,
  layer: string,
  target: string,
  detail: string | undefined,
  detectedAt: string
): DriftItem {
  return makeItem(type, layer, target, detail, detectedAt);
}

function makeItem(
  type: DriftType,
  layer: string,
  target: string,
  detail: string | undefined,
  detectedAt: string
): DriftItem {
  return {
    id: `${type}-${target}`.replace(/[^a-zA-Z0-9._/-]+/g, '_').slice(0, 120),
    type,
    layer,
    target,
    detail,
    detectedAt,
  };
}

function matchSimpleGlob(pattern: string, filePath: string): boolean {
  const norm = filePath.replace(/\\/g, '/');
  const p = pattern.replace(/\\/g, '/');
  if (p.endsWith('/**')) {
    const prefix = p.slice(0, -3);
    return norm.startsWith(prefix);
  }
  if (p.includes('*')) {
    const re = new RegExp(`^${p.replace(/\./g, '\\.').replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*')}$`);
    return re.test(norm);
  }
  return norm === p || norm.endsWith(`/${p}`);
}
