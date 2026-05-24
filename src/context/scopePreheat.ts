/** Scope resolution RAG preheat — R-PLAT-11 / R-DOCS-5 */

import type { AppServices } from '../app/appServices';
import { resolveContextTier } from './contextTier';
import type { MentionAttachment } from './mentionTokens';
import { buildScopePreheatKey } from './scopePreheatKey';

export { buildScopePreheatKey };

export function runScopePreheat(
  app: AppServices,
  userText: string,
  attachments: readonly MentionAttachment[]
): string {
  const query = userText.trim();
  if (!query) {
    return '';
  }

  const entries = app.docs.getEntries();
  const docAttachment = attachments.find((a) => a.kind === 'doc');
  const systemDoc = entries.find((e) => e.valid && e.frontmatter.level === 'system');
  const scope = docAttachment?.target ?? systemDoc?.relativePath;
  const model = app.platform.models.getSelected();
  const tier = resolveContextTier(model?.maxInputTokens, app.platform.getSettings().tierOverride);

  if (!app.platform.getSettings().ragEnabled || !app.indexManager.isRetrievalAvailable()) {
    return '';
  }

  const response = app.indexManager.retrieval.search({
    query,
    scope,
    tier,
    docEntries: entries,
    thoroughness: 'quick',
    topK: tier === 'L' ? 20 : tier === 'M' ? 12 : 8,
    includeDocChunks: true,
  });

  if (!response.results.length) {
    return '';
  }

  const lines = response.results.slice(0, 8).map((hit) => {
    const preview = hit.snippet.replace(/\s+/g, ' ').trim().slice(0, 400);
    return `- ${hit.path} (score ${hit.score.toFixed(2)}): ${preview}`;
  });
  return ['## Scope preheat (RAG)', ...lines].join('\n');
}
