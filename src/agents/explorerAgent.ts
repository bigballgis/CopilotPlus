/** Explorer sub-agent — R-AG-5 */

import * as vscode from 'vscode';
import type { AppServices } from '../app/appServices';
import { loadAgentPrompt } from './promptLoader';
import { SubAgentLoop } from './subAgentLoop';
import { parseExplorerOutput, type ExplorerResult } from './explorerParse';

export type ExplorerThoroughness = 'quick' | 'medium' | 'thorough';

export type { ExplorerFinding, ExplorerResult } from './explorerParse';

const BUDGETS: Record<ExplorerThoroughness, { maxToolCalls: number; wallMs: number }> = {
  quick: { maxToolCalls: 5, wallMs: 30_000 },
  medium: { maxToolCalls: 20, wallMs: 120_000 },
  thorough: { maxToolCalls: 60, wallMs: 600_000 },
};

export class ExplorerAgent {
  private readonly loop: SubAgentLoop;

  constructor(
    private readonly app: AppServices,
    private readonly extensionUri: vscode.Uri
  ) {
    this.loop = new SubAgentLoop(app.platform, app.tools);
  }

  async investigate(
    query: string,
    thoroughness: ExplorerThoroughness,
    buildId: string,
    parentTaskId: string,
    token: vscode.CancellationToken
  ): Promise<ExplorerResult> {
    const budget = BUDGETS[thoroughness] ?? BUDGETS.medium;
    const systemPrompt = await loadAgentPrompt(this.extensionUri, 'explorer');
    const toolIds = this.app.tools.getEffectiveTools('Explorer');

    const result = await this.loop.run({
      role: 'Explorer',
      buildId,
      taskId: `explorer-${parentTaskId}-${Date.now()}`,
      systemPrompt,
      userPrompt: `Query: ${query}\nThoroughness: ${thoroughness}\nPrefer code_search over manual grep chains.`,
      toolIds,
      maxToolCalls: budget.maxToolCalls,
      iterationTimeoutMs: budget.wallMs,
      token,
    });

    return parseExplorerOutput(result.finalAnswer);
  }
}
