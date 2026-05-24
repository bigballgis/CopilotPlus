/** Multi-Agent Verification selection logic — R-AG-8 */

import { cosineSimilarity } from '../context/vectorMath';
import type { VerificationStrategy } from './verificationConfig';

export interface VerificationCandidate {
  index: number;
  text: string;
  ok: boolean;
  reason?: string;
}

export interface VerificationSelection {
  selectedIndex: number;
  selectedText: string;
  strategy: VerificationStrategy;
  rationale: string;
  clusters?: number[][];
  escalate: boolean;
  escalationReason?: string;
}

export function jitterTemperature(): number {
  return Math.random() * 0.4;
}

export function structuralSimilarity(a: string, b: string): number {
  const na = normalizeStructural(a);
  const nb = normalizeStructural(b);
  if (na === nb) {
    return 1;
  }
  const ta = new Set(na.split(/\s+/).filter(Boolean));
  const tb = new Set(nb.split(/\s+/).filter(Boolean));
  if (ta.size === 0 && tb.size === 0) {
    return 1;
  }
  let inter = 0;
  for (const token of ta) {
    if (tb.has(token)) {
      inter += 1;
    }
  }
  const union = ta.size + tb.size - inter;
  return union ? inter / union : 0;
}

export function clusterByStructuralSimilarity(
  texts: string[],
  threshold = 0.85
): number[][] {
  const clusters: number[][] = [];
  for (let i = 0; i < texts.length; i++) {
    let placed = false;
    for (const cluster of clusters) {
      const rep = cluster[0];
      if (structuralSimilarity(texts[i], texts[rep]) >= threshold) {
        cluster.push(i);
        placed = true;
        break;
      }
    }
    if (!placed) {
      clusters.push([i]);
    }
  }
  return clusters;
}

export function maxPairwiseDistance(texts: string[]): number {
  if (texts.length < 2) {
    return 0;
  }
  const vectors = alignWordVectors(texts);
  let maxDistance = 0;
  for (let i = 0; i < vectors.length; i++) {
    for (let j = i + 1; j < vectors.length; j++) {
      const sim = cosineSimilarity(vectors[i], vectors[j]);
      maxDistance = Math.max(maxDistance, 1 - sim);
    }
  }
  return maxDistance;
}

export function selectVerificationOutput(
  candidates: VerificationCandidate[],
  strategy: VerificationStrategy,
  disagreementMax: number
): VerificationSelection {
  const successful = candidates.filter((c) => c.ok && c.text.trim());
  if (successful.length === 0) {
    return {
      selectedIndex: -1,
      selectedText: '',
      strategy,
      rationale: 'All candidates failed.',
      escalate: true,
      escalationReason: 'all_failed',
    };
  }

  if (successful.length === 1) {
    const only = successful[0];
    return {
      selectedIndex: only.index,
      selectedText: only.text,
      strategy,
      rationale: 'Single successful candidate.',
      escalate: false,
    };
  }

  const texts = successful.map((c) => c.text);
  const indices = successful.map((c) => c.index);

  if (strategy === 'union') {
    const merged = mergeUnionOutputs(texts);
    return {
      selectedIndex: indices[0],
      selectedText: merged,
      strategy,
      rationale: 'Merged non-conflicting sections from all candidates.',
      escalate: false,
    };
  }

  if (strategy === 'arbiter') {
    const distance = maxPairwiseDistance(texts);
    if (distance > disagreementMax) {
      return {
        selectedIndex: -1,
        selectedText: '',
        strategy,
        rationale: `Candidate distance ${distance.toFixed(2)} exceeds ${disagreementMax}.`,
        escalate: true,
        escalationReason: 'disagreement',
      };
    }
    return {
      selectedIndex: indices[0],
      selectedText: texts[0],
      strategy,
      rationale: 'Arbiter selection deferred to host LLM call.',
      escalate: false,
    };
  }

  const clusters = clusterByStructuralSimilarity(texts);
  clusters.sort((a, b) => b.length - a.length);
  const winner = clusters[0];
  const majorityNeeded = Math.ceil(successful.length / 2);
  if (winner.length < majorityNeeded) {
    return {
      selectedIndex: -1,
      selectedText: '',
      strategy,
      rationale: `Largest cluster size ${winner.length} below majority ${majorityNeeded}.`,
      clusters,
      escalate: true,
      escalationReason: 'disagreement',
    };
  }

  const repLocalIndex = winner[0];
  return {
    selectedIndex: indices[repLocalIndex],
    selectedText: texts[repLocalIndex],
    strategy,
    rationale: `Majority cluster (${winner.length}/${successful.length} candidates).`,
    clusters,
    escalate: false,
  };
}

export function mergeUnionOutputs(outputs: string[]): string {
  const sections: string[] = [];
  const seen = new Set<string>();
  for (const output of outputs) {
    const parts = output.split(/(?=^#{1,3}\s)/m).filter((p) => p.trim());
    if (parts.length === 0) {
      const key = normalizeStructural(output);
      if (!seen.has(key)) {
        seen.add(key);
        sections.push(output.trim());
      }
      continue;
    }
    for (const part of parts) {
      const key = normalizeStructural(part);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      sections.push(part.trim());
    }
  }
  return sections.join('\n\n');
}

function normalizeStructural(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function wordFreq(text: string): Map<string, number> {
  const map = new Map<string, number>();
  for (const word of text.toLowerCase().match(/\b\w+\b/g) ?? []) {
    map.set(word, (map.get(word) ?? 0) + 1);
  }
  return map;
}

function alignWordVectors(texts: string[]): number[][] {
  const maps = texts.map((t) => wordFreq(t));
  const vocab = new Set<string>();
  for (const map of maps) {
    for (const key of map.keys()) {
      vocab.add(key);
    }
  }
  const keys = [...vocab].sort();
  return maps.map((map) => keys.map((key) => map.get(key) ?? 0));
}
