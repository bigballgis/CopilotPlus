/** Web fetch/search tools — R-TOOL-12 */

import { stripHtml } from '../context/mentionWebFetch';

const TIMEOUT_MS = 15_000;
const DEFAULT_MAX_CHARS = 30_000;
const MAX_MAX_CHARS = 200_000;

export interface WebFetchResult {
  url: string;
  status_code: number;
  content: string;
  truncated: boolean;
  content_type: string;
}

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  published?: string;
}

export function validateHttpsUrl(raw: string): { ok: true; url: URL } | { ok: false; reason: string } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, reason: 'invalid_url' };
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, reason: 'invalid_url' };
  }
  if (parsed.protocol !== 'https:') {
    return { ok: false, reason: 'scheme_not_allowed' };
  }
  return { ok: true, url: parsed };
}

export function resolveWebFetchMaxChars(
  mode: unknown,
  maxChars: unknown
): number {
  if (mode === 'full') {
    return MAX_MAX_CHARS;
  }
  const requested = typeof maxChars === 'number' && Number.isFinite(maxChars) ? maxChars : DEFAULT_MAX_CHARS;
  return Math.min(MAX_MAX_CHARS, Math.max(1, Math.trunc(requested)));
}

export async function executeWebFetch(args: {
  url: string;
  mode?: unknown;
  max_chars?: unknown;
}): Promise<{ ok: true; data: WebFetchResult } | { ok: false; reason: string }> {
  const validated = validateHttpsUrl(args.url);
  if (!validated.ok) {
    return validated;
  }

  const maxChars = resolveWebFetchMaxChars(args.mode, args.max_chars);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(validated.url.toString(), {
      signal: controller.signal,
      headers: { Accept: 'text/html,text/plain,application/json,*/*' },
    });
    const contentType = response.headers.get('content-type') ?? 'text/plain';
    const buffer = await response.arrayBuffer();
    let text = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
    if (/html/i.test(contentType)) {
      text = stripHtml(text);
    }
    const truncated = text.length > maxChars;
    if (truncated) {
      text = text.slice(0, maxChars);
    }
    return {
      ok: true,
      data: {
        url: validated.url.toString(),
        status_code: response.status,
        content: text,
        truncated,
        content_type: contentType,
      },
    };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return { ok: false, reason: 'timeout' };
    }
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}

export function resolveWebSearchMaxResults(value: unknown): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : 10;
  return Math.min(20, Math.max(1, Math.trunc(n)));
}

export function buildWebSearchUrl(endpoint: string, query: string): string {
  if (endpoint.includes('{query}')) {
    return endpoint.replace('{query}', encodeURIComponent(query));
  }
  const separator = endpoint.includes('?') ? '&' : '?';
  return `${endpoint}${separator}q=${encodeURIComponent(query)}`;
}

export function parseWebSearchResponse(payload: unknown): WebSearchResult[] {
  if (!payload || typeof payload !== 'object') {
    return [];
  }
  const rawResults = (payload as { results?: unknown }).results;
  if (!Array.isArray(rawResults)) {
    return [];
  }
  const out: WebSearchResult[] = [];
  for (const item of rawResults) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const row = item as Record<string, unknown>;
    const title = typeof row.title === 'string' ? row.title : '';
    const url = typeof row.url === 'string' ? row.url : '';
    const snippet = typeof row.snippet === 'string' ? row.snippet : '';
    if (!title || !url) {
      continue;
    }
    out.push({
      title,
      url,
      snippet,
      published: typeof row.published === 'string' ? row.published : undefined,
    });
  }
  return out;
}

export async function executeWebSearch(
  query: string,
  maxResults: number,
  endpoint: string,
  apiKey?: string
): Promise<{ ok: true; data: WebSearchResult[] } | { ok: false; reason: string }> {
  const trimmed = query.trim();
  if (!trimmed) {
    return { ok: false, reason: 'invalid_query' };
  }
  if (!endpoint.trim()) {
    return { ok: false, reason: 'websearch_disabled' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  try {
    const response = await fetch(buildWebSearchUrl(endpoint, trimmed), {
      signal: controller.signal,
      headers,
    });
    if (!response.ok) {
      return { ok: false, reason: `http_${response.status}` };
    }
    const payload = (await response.json()) as unknown;
    return { ok: true, data: parseWebSearchResponse(payload).slice(0, maxResults) };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return { ok: false, reason: 'timeout' };
    }
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}
