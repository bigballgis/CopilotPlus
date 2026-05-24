/** Context payload budgeting — R-CTX-4 */

export type ContextItemCategory =
  | 'mentions'
  | 'layerWalk'
  | 'selection'
  | 'currentFile'
  | 'ragRetrievals'
  | 'codeRetrievals'
  | 'chatHistory';

export interface ContextBudgetItem {
  category: ContextItemCategory;
  priority: number;
  text: string;
}

export type ContextDropCounts = Partial<Record<ContextItemCategory, number>>;

export interface ContextBudgetResult {
  included: ContextBudgetItem[];
  dropped: ContextDropCounts;
  estimatedTokens: number;
  blocked?: boolean;
  blockReason?: string;
}

const CATEGORY_LABELS: Record<ContextItemCategory, string> = {
  mentions: 'Mentions',
  layerWalk: 'Layer walk',
  selection: 'Active selection',
  currentFile: 'Current file',
  ragRetrievals: 'RAG retrievals',
  codeRetrievals: 'Codebase retrievals',
  chatHistory: 'Prior chat history',
};

export function estimateTextTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function fitContextToBudget(
  items: ContextBudgetItem[],
  tokenBudget: number
): ContextBudgetResult {
  const sorted = [...items].sort((a, b) => a.priority - b.priority || a.category.localeCompare(b.category));
  const included: ContextBudgetItem[] = [];
  const dropped: ContextDropCounts = {};
  let used = 0;

  for (const item of sorted) {
    const tokens = estimateTextTokens(item.text);
    if (!item.text.trim()) {
      continue;
    }
    if (tokens > tokenBudget) {
      if (included.length === 0) {
        return {
          included: [],
          dropped,
          estimatedTokens: tokens,
          blocked: true,
          blockReason: `A single context item (${CATEGORY_LABELS[item.category]}) exceeds the model input limit.`,
        };
      }
      dropped[item.category] = (dropped[item.category] ?? 0) + 1;
      continue;
    }
    if (used + tokens <= tokenBudget) {
      included.push(item);
      used += tokens;
      continue;
    }
    dropped[item.category] = (dropped[item.category] ?? 0) + 1;
  }

  return { included, dropped, estimatedTokens: used };
}

export function formatContextDropSummary(dropped: ContextDropCounts): string {
  const parts = Object.entries(dropped)
    .filter(([, count]) => (count ?? 0) > 0)
    .map(([category, count]) => `${CATEGORY_LABELS[category as ContextItemCategory]} (${count})`);
  return parts.length ? `Dropped context to fit budget: ${parts.join(', ')}` : '';
}

export function contextItem(
  category: ContextItemCategory,
  text: string
): ContextBudgetItem {
  const priority: Record<ContextItemCategory, number> = {
    mentions: 1,
    layerWalk: 2,
    selection: 3,
    currentFile: 4,
    ragRetrievals: 5,
    codeRetrievals: 6,
    chatHistory: 7,
  };
  return { category, priority: priority[category], text };
}

export function resolveTokenBudget(maxInputTokens: number | undefined, configuredCap: number): number {
  return maxInputTokens ?? configuredCap;
}

export function hasDroppedContext(dropped: ContextDropCounts): boolean {
  return Object.values(dropped).some((count) => (count ?? 0) > 0);
}
