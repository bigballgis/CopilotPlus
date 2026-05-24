/** ## Summary section helpers — R-DOCS-14.6 */

import type { DocEntry } from './documentTreeService';

export const SUMMARY_MIN_CHARS = 100;
export const SUMMARY_MAX_CHARS = 800;

const SUMMARY_HEADING = /^##\s+Summary\s*$/im;
const SUMMARY_BLOCK =
  /^##\s+Summary\s*\n([\s\S]*?)(?=\n##\s|\n---\s*$|$)/im;

export function hasSummarySection(body: string): boolean {
  return SUMMARY_HEADING.test(body);
}

export function extractSummaryText(body: string): string {
  const match = body.match(SUMMARY_BLOCK);
  return match?.[1]?.trim() ?? '';
}

export function isSummaryLengthValid(text: string): boolean {
  const len = text.trim().length;
  return len >= SUMMARY_MIN_CHARS && len <= SUMMARY_MAX_CHARS;
}

export function isSummaryMissingOrInvalid(body: string): boolean {
  if (!hasSummarySection(body)) {
    return true;
  }
  return !isSummaryLengthValid(extractSummaryText(body));
}

export function buildDraftSummary(entry: Pick<DocEntry, 'frontmatter'>): string {
  const { title, level, description } = entry.frontmatter;
  let text =
    description?.trim() ||
    `${title} (${level}) summarizes scope, responsibilities, and key design decisions for this layer of the document tree.`;
  if (text.length < SUMMARY_MIN_CHARS) {
    text = `${text} Review and refine this summary so downstream Layer_Walk and Sub-Agent scope stay accurate.`;
  }
  while (text.length < SUMMARY_MIN_CHARS) {
    text += ' Add concrete boundaries and ownership notes.';
  }
  return text.slice(0, SUMMARY_MAX_CHARS);
}

export function upsertSummarySection(body: string, summaryText: string): string {
  const trimmed = summaryText.trim();
  if (hasSummarySection(body)) {
    return body.replace(SUMMARY_BLOCK, `## Summary\n\n${trimmed}\n`);
  }
  const rest = body.replace(/^\s*/, '');
  return rest.length > 0 ? `## Summary\n\n${trimmed}\n\n${rest}` : `## Summary\n\n${trimmed}\n`;
}
