/** Explorer result parsing — R-AG-5 */

export interface ExplorerFinding {
  path: string;
  range?: string;
  summary: string;
}

export interface ExplorerResult {
  findings: ExplorerFinding[];
  recommended_files: string[];
  raw_summary: string;
}

export function parseExplorerOutput(text: string): ExplorerResult {
  const jsonMatch = text.match(/```json\s*([\s\S]*?)```/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]) as ExplorerResult;
      return {
        findings: parsed.findings ?? [],
        recommended_files: parsed.recommended_files ?? [],
        raw_summary: text,
      };
    } catch {
      /* fall through */
    }
  }
  return { findings: [], recommended_files: [], raw_summary: text.trim() };
}
