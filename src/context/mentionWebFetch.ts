/** @web mention fetch — R-CTX-1.9–1.10 */

const MAX_BYTES = 200_000;
const TIMEOUT_MS = 15_000;

export async function fetchWebMention(target: string): Promise<{ ok: true; text: string } | { ok: false; reason: string }> {
  const url = normalizeWebTarget(target);
  if (!url) {
    return { ok: false, reason: 'invalid_url' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'text/html,text/plain,*/*' },
    });
    if (!response.ok) {
      return { ok: false, reason: `http_${response.status}` };
    }
    const buffer = await response.arrayBuffer();
    const slice = buffer.byteLength > MAX_BYTES ? buffer.slice(0, MAX_BYTES) : buffer;
    const text = new TextDecoder('utf-8', { fatal: false }).decode(slice);
    return { ok: true, text: stripHtml(text) };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return { ok: false, reason: 'timeout' };
    }
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}

export function normalizeWebTarget(target: string): string | undefined {
  const trimmed = target.trim();
  if (!trimmed) {
    return undefined;
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

export function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
