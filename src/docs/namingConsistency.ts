/** Document naming collision detection — R-DOCS-7.1 */

import type { DocFrontmatter } from './frontmatter';
import type { DocEntry } from './documentTreeService';

export function levenshtein(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const matrix: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let i = 0; i < rows; i++) {
    matrix[i]![0] = i;
  }
  for (let j = 0; j < cols; j++) {
    matrix[0]![j] = j;
  }
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i]![j] = Math.min(
        matrix[i - 1]![j]! + 1,
        matrix[i]![j - 1]! + 1,
        matrix[i - 1]![j - 1]! + cost
      );
    }
  }
  return matrix[a.length]![b.length]!;
}

export function titleTokenOverlap(a: string, b: string): number {
  const tokenize = (value: string) =>
    new Set(
      value
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((part) => part.length > 0)
    );
  const left = tokenize(a);
  const right = tokenize(b);
  if (left.size === 0 || right.size === 0) {
    return 0;
  }
  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) {
      intersection += 1;
    }
  }
  const union = new Set([...left, ...right]).size;
  return union === 0 ? 0 : intersection / union;
}

export function findNamingCollision(
  proposed: DocFrontmatter,
  entries: DocEntry[],
  excludeId?: string
): DocEntry | undefined {
  const siblings = entries.filter(
    (entry) =>
      entry.valid &&
      !entry.relativePath.includes('/archive/') &&
      entry.frontmatter.level === proposed.level &&
      entry.frontmatter.parent === proposed.parent &&
      entry.frontmatter.id !== proposed.id &&
      entry.frontmatter.id !== excludeId
  );

  for (const sibling of siblings) {
    if (levenshtein(proposed.id, sibling.frontmatter.id) <= 2) {
      return sibling;
    }
    if (titleTokenOverlap(proposed.title, sibling.frontmatter.title) > 0.6) {
      return sibling;
    }
  }
  return undefined;
}
