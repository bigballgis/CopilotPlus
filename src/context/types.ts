/** Index chunk types — R-CTX-2, R-CTX-3 */

export type IndexCorpus = 'code' | 'doc';

export interface IndexChunk {
  id: string;
  corpus: IndexCorpus;
  path: string;
  line?: number;
  heading?: string;
  headingPath?: string[];
  text: string;
  docPaths?: string[];
  linkTargets?: string[];
  embedding?: number[];
}

export interface SearchHit {
  path: string;
  line?: number;
  snippet: string;
  score: number;
  kind: IndexCorpus;
  heading?: string;
  headingPath?: string[];
  linkTargets?: string[];
}

export type IndexStatus = 'Idle' | 'Building' | 'Ready' | 'Rebuilding' | 'Failed';

export interface IndexState {
  code: IndexStatus;
  docs: IndexStatus;
  embeddingMode: string;
  embeddingModelId?: string;
  embeddingAddonVersion?: string;
  embeddingNotice?: string;
  embeddedChunks?: number;
  codeChunks: number;
  docChunks: number;
  lastError?: string;
}
