/** File chunking — R-CTX-2.4, R-CTX-3.2 */

export const FALLBACK_CHUNK_SIZE = 800;
export const FALLBACK_CHUNK_OVERLAP = 200;

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

const SEMANTIC_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java', '.cs']);

const SEMANTIC_BOUNDARY =
  /^(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function\s+\w+|class\s+\w+|(?:public|private|protected|static)\s+[\w<>,\s]+\s+\w+\s*\(|(?:public|private|protected)\s+\w+\s*\(|def\s+\w+\s*\(|func\s+(?:\([^)]*\)\s+)?\w+\s*\(|fn\s+\w+\s*\(|(?:public|private|protected|static|async)?\s*[\w$]+\s*\([^)]*\)\s*\{?\s*$)/;

export function isIndexableCodeFile(name: string): boolean {
  const ext = name.slice(name.lastIndexOf('.'));
  return CODE_EXTS.has(ext);
}

export function chunkSourceFile(path: string, content: string): Array<{ line: number; text: string }> {
  if (content.length <= FALLBACK_CHUNK_SIZE) {
    return [{ line: 1, text: content }];
  }

  const semantic = trySemanticChunks(path, content);
  if (semantic.length > 0) {
    return semantic;
  }

  return chunkSlidingWindow(content);
}

export function chunkSlidingWindow(content: string): Array<{ line: number; text: string }> {
  const lineStarts = buildLineStarts(content);
  const chunks: Array<{ line: number; text: string }> = [];
  const step = Math.max(1, FALLBACK_CHUNK_SIZE - FALLBACK_CHUNK_OVERLAP);

  for (let start = 0; start < content.length; start += step) {
    const slice = content.slice(start, start + FALLBACK_CHUNK_SIZE);
    if (!slice.trim()) {
      continue;
    }
    chunks.push({ line: lineNumberAtOffset(lineStarts, start), text: slice });
    if (start + FALLBACK_CHUNK_SIZE >= content.length) {
      break;
    }
  }

  return chunks.length ? chunks : [{ line: 1, text: content }];
}

function trySemanticChunks(path: string, content: string): Array<{ line: number; text: string }> {
  const ext = path.slice(path.lastIndexOf('.'));
  if (!SEMANTIC_EXTS.has(ext)) {
    return [];
  }

  const lines = content.split('\n');
  const boundaryLines: number[] = [0];
  for (let i = 1; i < lines.length; i++) {
    if (SEMANTIC_BOUNDARY.test(lines[i].trim())) {
      boundaryLines.push(i);
    }
  }

  if (boundaryLines.length <= 1) {
    return [];
  }

  const raw: Array<{ line: number; text: string }> = [];
  for (let i = 0; i < boundaryLines.length; i++) {
    const start = boundaryLines[i];
    const end = i + 1 < boundaryLines.length ? boundaryLines[i + 1] : lines.length;
    const text = lines.slice(start, end).join('\n');
    if (text.trim()) {
      raw.push({ line: start + 1, text });
    }
  }

  return normalizeSemanticChunks(raw, content);
}

function normalizeSemanticChunks(
  raw: Array<{ line: number; text: string }>,
  fullContent: string
): Array<{ line: number; text: string }> {
  const merged: Array<{ line: number; text: string }> = [];
  for (const chunk of raw) {
    if (chunk.text.length <= FALLBACK_CHUNK_SIZE) {
      merged.push(chunk);
      continue;
    }
    merged.push(...chunkSlidingWindow(chunk.text).map((part) => ({
      line: chunk.line + part.line - 1,
      text: part.text,
    })));
  }

  if (merged.length <= 1 && fullContent.length > FALLBACK_CHUNK_SIZE) {
    return [];
  }
  return merged;
}

function buildLineStarts(content: string): number[] {
  const starts = [0];
  for (let i = 0; i < content.length; i++) {
    if (content[i] === '\n') {
      starts.push(i + 1);
    }
  }
  return starts;
}

function lineNumberAtOffset(lineStarts: number[], offset: number): number {
  let low = 0;
  let high = lineStarts.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (lineStarts[mid] <= offset) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return Math.max(1, high + 1);
}

export function chunkMarkdownDoc(
  path: string,
  content: string
): Array<{ heading: string; headingPath: string[]; text: string }> {
  const lines = content.split('\n');
  const chunks: Array<{ heading: string; headingPath: string[]; text: string }> = [];
  const stack: Array<{ level: number; title: string }> = [];
  let currentLines: string[] = [];
  let currentTitle = 'root';
  let currentPath: string[] = ['root'];

  const flush = () => {
    const text = currentLines.join('\n').trim();
    if (text) {
      chunks.push({ heading: currentTitle, headingPath: [...currentPath], text });
    }
  };

  for (const line of lines) {
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      flush();
      const level = match[1].length;
      const title = match[2].trim();
      while (stack.length > 0 && stack[stack.length - 1]!.level >= level) {
        stack.pop();
      }
      stack.push({ level, title });
      currentTitle = title;
      currentPath = stack.map((item) => item.title);
      currentLines = [line];
      continue;
    }
    currentLines.push(line);
  }
  flush();

  if (!chunks.length) {
    return [{ heading: 'root', headingPath: ['root'], text: content }];
  }
  return chunks;
}
