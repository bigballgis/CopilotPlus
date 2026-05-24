/** Model selection and persistence — R-PLAT-3 */

import * as vscode from 'vscode';
import type { ContextTier, ModelOptionWire, ModelSurface } from '../shared/types';
import { resolveContextTier } from './contextTier';
import { CopilotAuthService } from './copilotAuth';
import { t } from './l10n';

const WORKSPACE_MODEL_KEY = 'copilotPlus.selectedModelId';

export class ModelService {
  private models: vscode.LanguageModelChat[] = [];
  private selected: vscode.LanguageModelChat | undefined;
  private readonly onDidChangeEmitter = new vscode.EventEmitter<void>();
  readonly onDidChange = this.onDidChangeEmitter.event;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly auth: CopilotAuthService
  ) {}

  async refresh(): Promise<vscode.LanguageModelChat[]> {
    this.models = await this.auth.selectCopilotModels();
    this.models.sort((a, b) => a.name.localeCompare(b.name));
    if (this.models.length > 50) {
      this.models = this.models.slice(0, 50);
    }
    await this.resolveSelection();
    this.onDidChangeEmitter.fire();
    return this.models;
  }

  getModels(): vscode.LanguageModelChat[] {
    return this.models;
  }

  getModelOptions(): ModelOptionWire[] {
    return this.models.map((model) => ({ id: model.id, name: model.name }));
  }

  getSelected(): vscode.LanguageModelChat | undefined {
    return this.selected;
  }

  hasModels(): boolean {
    return this.models.length > 0;
  }

  getHeaderState(): {
    models: ModelOptionWire[];
    selectedModelId: string;
    modelsAvailable: boolean;
    modelUnavailableNotice?: string;
  } {
    const models = this.getModelOptions();
    return {
      models,
      selectedModelId: this.selected?.id ?? '',
      modelsAvailable: models.length > 0,
      modelUnavailableNotice: models.length > 0 ? undefined : t('models.noModelsAvailable'),
    };
  }

  async pickModel(modelId?: string): Promise<void> {
    if (modelId) {
      const found = this.models.find((m) => m.id === modelId || m.name === modelId);
      if (found) {
        this.selected = found;
        await this.persistSelection(found);
        this.onDidChangeEmitter.fire();
        return;
      }
    }

    if (this.models.length === 0) {
      return;
    }

    const item = await vscode.window.showQuickPick(
      this.models.map((m) => ({ label: m.name, description: m.id, model: m })),
      { placeHolder: t('models.pickPlaceholder') }
    );
    if (item) {
      this.selected = item.model;
      await this.persistSelection(item.model);
      this.onDidChangeEmitter.fire();
    }
  }
  async resolveSelectionForSurface(_surface: ModelSurface): Promise<vscode.LanguageModelChat | undefined> {
    if (this.models.length === 0) {
      await this.refresh();
    }
    return this.selected ?? this.models[0];
  }

  getContextTier(model: vscode.LanguageModelChat, override: 'auto' | 's' | 'm' | 'l' = 'auto'): ContextTier {
    return resolveContextTier(model.maxInputTokens, override);
  }

  private async resolveSelection(): Promise<void> {
    if (this.models.length === 0) {
      this.selected = undefined;
      return;
    }

    const config = vscode.workspace.getConfiguration('copilotPlus');
    const defaultId = config.get<string>('models.default');
    const persisted = this.context.workspaceState.get<string>(WORKSPACE_MODEL_KEY);
    const candidates = [defaultId, persisted].filter(Boolean) as string[];

    for (const id of candidates) {
      const found = this.models.find((m) => m.id === id);
      if (found) {
        this.selected = found;
        return;
      }
    }

    const previous = this.selected?.id;
    this.selected = this.models[0];
    if (previous && previous !== this.selected.id) {
      void vscode.window.showInformationMessage(
        t('models.substituteNotice', previous, this.selected.name)
      );
    }
  }
  private async persistSelection(model: vscode.LanguageModelChat): Promise<void> {
    await this.context.workspaceState.update(WORKSPACE_MODEL_KEY, model.id);
  }
}
