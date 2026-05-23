/** File chunking — R-CTX-2.4, R-CTX-3.2 */

const CODE_EXTS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.json',
  '.md',
  '.py',
  '.go',
  '.rs',
  '.java',
  '.cs',
  '.vue',
  '.css',
  '.scss',
]);

export function isIndexableCodeFile(name: string): boolean {
  const ext = name.slice(name.lastIndexOf('.'));
  return CODE_EXTS.has(ext);
}

export function chunkSourceFile(path: string, content: string): Array<{ line: number; text: string }> {
  const lines = content.split('\n');
  if (lines.length <= 80) {
    return [{ line: 1, text: content }];
  }

  const chunks: Array<{ line: number; text: string }> = [];
  const window = 40;
  const overlap = 10;
  for (let start = 0; start < lines.length; start += window - overlap) {
    const slice = lines.slice(start, start + window);
    chunks.push({ line: start + 1, text: slice.join('\n') });
  }
  return chunks;
}

export function chunkMarkdownDoc(path: string, content: string): Array<{ heading: string; text: string }> {
  const sections: Array<{ heading: string; text: string }> = [];
  const parts = content.split(/^##\s+/m);
  if (parts.length <= 1) {
    return [{ heading: 'root', text: content }];
  }
  const preamble = parts[0];
  if (preamble.trim()) {
    sections.push({ heading: 'preamble', text: preamble.trim() });
  }
  for (let i = 1; i < parts.length; i++) {
    const block = parts[i];
    const nl = block.indexOf('\n');
    const title = nl >= 0 ? block.slice(0, nl).trim() : block.trim();
    const body = nl >= 0 ? block.slice(nl + 1) : '';
    sections.push({ heading: title || `section-${i}`, text: `## ${title}\n${body}`.trim() });
  }
  return sections;
}
