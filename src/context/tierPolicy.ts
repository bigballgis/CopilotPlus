/** Tier-specific context policy — R-CTX-8 */

import type { ContextTier } from '../shared/types';
import type { DocEntry } from '../docs/documentTreeService';
import type { DocFrontmatter } from '../docs/frontmatter';

export function resolveEffectiveSessionCap(
  maxInputTokens: number | undefined,
  configuredCap: number,
  tier: ContextTier
): number {
  if (tier === 'M' || tier === 'L') {
    const modelCap = maxInputTokens ?? configuredCap;
    return Math.min(configuredCap, modelCap * 100);
  }
  return configuredCap;
}

export function scopeMaxDocs(tier: ContextTier): number {
  return tier === 'L' ? 1000 : 100;
}

export function shouldCapAgentsLayers(tier: ContextTier): boolean {
  return tier === 'S';
}

export function defaultRetrievalTopK(tier: ContextTier): number {
  if (tier === 'L') {
    return 50;
  }
  if (tier === 'M') {
    return 50;
  }
  return 10;
}

export function buildModuleFrontmatterContext(entries: DocEntry[], tier: ContextTier): string {
  if (tier === 'S') {
    return '';
  }
  const levels = tier === 'M' ? new Set(['system', 'module']) : new Set(['system', 'module', 'feature', 'component']);
  const lines = entries
    .filter((entry) => entry.valid && levels.has(entry.frontmatter.level))
    .map((entry) => {
      return `## ${entry.relativePath}\n\`\`\`yaml\n${serializeFrontmatter(entry.frontmatter)}\n\`\`\``;
    });
  return lines.length ? ['## Document frontmatter (tier policy)', ...lines].join('\n\n') : '';
}

function serializeFrontmatter(frontmatter: DocFrontmatter): string {
  const rows: string[] = [];
  rows.push(`id: ${frontmatter.id}`);
  rows.push(`level: ${frontmatter.level}`);
  rows.push(`title: ${frontmatter.title}`);
  if (frontmatter.parent) {
    rows.push(`parent: ${frontmatter.parent}`);
  }
  if (frontmatter.children?.length) {
    rows.push(`children: [${frontmatter.children.join(', ')}]`);
  }
  return rows.join('\n');
}
