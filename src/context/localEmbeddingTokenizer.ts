/** Tokenization for enterprise ONNX embedding models — R-CTX-5 Mode B */

export interface EncodedSequence {
  inputIds: number[];
  attentionMask: number[];
  tokenTypeIds?: number[];
}

const DEFAULT_CLS = 101;
const DEFAULT_SEP = 102;
const DEFAULT_UNK = 100;
const DEFAULT_PAD = 0;

export function loadVocab(content: string): Map<string, number> {
  const map = new Map<string, number>();
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const tab = line.indexOf('\t');
    if (tab >= 0) {
      map.set(line.slice(0, tab), Number.parseInt(line.slice(tab + 1), 10));
    } else {
      map.set(line, i);
    }
  }
  return map;
}

export function encodeWhitespaceIds(text: string, maxLen: number): EncodedSequence {
  const tokens = text.toLowerCase().match(/[^\s]+/g) ?? [];
  const ids: number[] = [DEFAULT_CLS];
  for (const token of tokens) {
    if (ids.length >= maxLen - 1) {
      break;
    }
    ids.push(hashTokenId(token));
  }
  ids.push(DEFAULT_SEP);
  return padSequence(ids, maxLen);
}

export function encodeVocabIds(text: string, vocab: Map<string, number>, maxLen: number): EncodedSequence {
  const cls = vocab.get('[CLS]') ?? DEFAULT_CLS;
  const sep = vocab.get('[SEP]') ?? DEFAULT_SEP;
  const unk = vocab.get('[UNK]') ?? DEFAULT_UNK;
  const tokens = text.toLowerCase().match(/[^\s]+/g) ?? [];
  const ids: number[] = [cls];
  for (const token of tokens) {
    if (ids.length >= maxLen - 1) {
      break;
    }
    ids.push(vocab.get(token) ?? unk);
  }
  ids.push(sep);
  return padSequence(ids, maxLen);
}

export function padSequence(ids: number[], maxLen: number): EncodedSequence {
  const realLen = Math.min(ids.length, maxLen);
  const inputIds = ids.slice(0, maxLen);
  const attentionMask = new Array<number>(maxLen).fill(0);
  for (let i = 0; i < realLen; i++) {
    attentionMask[i] = 1;
  }
  while (inputIds.length < maxLen) {
    inputIds.push(DEFAULT_PAD);
  }
  return { inputIds, attentionMask };
}

function hashTokenId(token: string): number {
  let h = 2166136261;
  for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (Math.abs(h) % 29_999) + 1;
}

export function normalizeVector(vec: number[]): number[] {
  let norm = 0;
  for (const v of vec) {
    norm += v * v;
  }
  norm = Math.sqrt(norm) || 1;
  return vec.map((v) => v / norm);
}
