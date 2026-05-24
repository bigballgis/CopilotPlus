/** Pure text-edit application for LSP rename preview — R-TOOL-5 */

export interface TextEditLike {
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  newText: string;
}

export function applyTextEdits(original: string, edits: readonly TextEditLike[]): string {
  const sorted = [...edits].sort((a, b) => {
    const startA = a.range.start.line * 1_000_000 + a.range.start.character;
    const startB = b.range.start.line * 1_000_000 + b.range.start.character;
    return startB - startA;
  });
  let text = original;
  for (const edit of sorted) {
    const start = offsetAt(text, edit.range.start);
    const end = offsetAt(text, edit.range.end);
    text = text.slice(0, start) + edit.newText + text.slice(end);
  }
  return text;
}

function offsetAt(text: string, pos: { line: number; character: number }): number {
  const lines = text.split('\n');
  let offset = 0;
  for (let i = 0; i < pos.line; i++) {
    offset += lines[i]!.length + 1;
  }
  return offset + pos.character;
}
