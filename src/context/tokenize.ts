/** Tokenization for BM25 — R-CTX-2 */

export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9_\-./]+/g) ?? []).filter((t) => t.length > 1);
}

export function termFrequency(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  for (const t of tokens) {
    tf.set(t, (tf.get(t) ?? 0) + 1);
  }
  return tf;
}
