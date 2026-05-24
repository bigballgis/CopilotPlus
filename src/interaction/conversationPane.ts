/** Conversation Pane — R-INT-2 */

import * as vscode from 'vscode';
import type { AppServices } from '../app/appServices';
import { getConversationWebviewHtml } from './webviewBundle';
import { SessionStore } from './sessionStore';
import type { WorkflowStage } from '../shared/types';
import type {
  ConversationLabels,
  ConversationStateSync,
  ConversationWebviewMessage,
} from '../shared/conversationWebviewProtocol';
import {
  mergeAttachments,
  parseMentionTokens,
  parseSlashSkill,
  pickMention,
  resolveMentionBlocks,
  type MentionAttachment,
} from '../context/mentions';
import { estimateAttachmentsBudget } from '../context/mentionBudget';
import {
  contextItem,
  fitContextToBudget,
  formatContextDropSummary,
  hasDroppedContext,
  resolveTokenBudget,
} from '../context/contextBudget';
import { resolveContextTier } from '../context/contextTier';
import { buildModuleFrontmatterContext, resolveEffectiveSessionCap } from '../context/tierPolicy';
import { buildLayerWalkForDoc, resolveScope } from '../docs/scopeResolution';
import { buildScopePreheatKey, runScopePreheat } from '../context/scopePreheat';
import { estimateTokens } from '../platform/chatClient';
import { t } from '../platform/l10n';
import { isDesignWorkflowStep } from '../workflow/designSteps';

export class ConversationPaneProvider {
  private panel: vscode.WebviewPanel | undefined;
  private readonly sessions: SessionStore;
  private cancelSource: vscode.CancellationTokenSource | undefined;
  private sessionTokens = 0;
  private pendingAttachments: MentionAttachment[] = [];
  private preheatTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly extensionUri: vscode.Uri,
    context: vscode.ExtensionContext,
    private readonly app: AppServices
  ) {
    this.sessions = new SessionStore(context);
    void this.sessions.load();
    app.speculative.setTokenSink((tokens) => {
      this.sessionTokens += tokens;
      this.sessions.addTokens(tokens);
      this.postMessage({ type: 'tokenUpdate', tokens: this.sessionTokens });
    });
    context.subscriptions.push(
      app.stages.onDesignStepChange(() => {
        void this.syncWebviewState();
      }),
      app.buildExecutor.onChange(() => {
        void this.syncWebviewState();
      }),
      app.platform.models.onDidChange(() => {
        void this.syncWebviewState();
      })
    );
  }

  async show(column: vscode.ViewColumn): Promise<void> {
    if (this.panel) {
      this.panel.reveal(column);
      void this.syncWebviewState();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'copilotPlus.conversation',
      t('conversation.panelTitle'),
      column,
      { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [this.extensionUri] }
    );

    this.panel.webview.html = getConversationWebviewHtml(this.panel.webview, this.extensionUri, {
      title: t('conversation.panelTitle'),
    });
    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });

    this.panel.webview.onDidReceiveMessage(async (msg: ConversationWebviewMessage) => {
      if (msg.type === 'ready') {
        void this.syncWebviewState();
        return;
      }
      if (msg.type === 'submit' && msg.text) {
        await this.handleSubmit(msg.text, msg.attachments ?? []);
      }
      if (msg.type === 'pickMention') {
        const mention = await pickMention(this.app);
        if (mention) {
          this.postMessage({ type: 'mentionAttached', mention });
        }
      }
      if (msg.type === 'cancel') {
        this.cancelSource?.cancel();
      }
      if (msg.type === 'newSession') {
        await this.sessions.startNewSession();
        this.app.summarizer.resetSession();
        this.sessionTokens = 0;
        this.pendingAttachments = [];
        void this.syncWebviewState({ resetMessages: true });
      }
      if (msg.type === 'continueDesign') {
        await this.handleContinueDesign();
      }
      if (msg.type === 'pickDesignStep' && msg.step) {
        await this.handlePickDesignStep(msg.step);
      }
      if (msg.type === 'selectModel' && msg.modelId) {
        await this.app.platform.models.pickModel(msg.modelId);
        await this.syncWebviewState();
      }
      if (msg.type === 'inputDraft' && typeof msg.text === 'string') {
        this.scheduleScopePreheat(msg.text, msg.attachments ?? []);
      }
    });
  }

  private scheduleScopePreheat(text: string, attachments: MentionAttachment[]): void {
    if (this.app.stages.getStage() !== 'Design') {
      return;
    }
    if (this.preheatTimer) {
      clearTimeout(this.preheatTimer);
    }
    this.preheatTimer = setTimeout(() => {
      const trimmed = text.trim();
      if (!trimmed) {
        return;
      }
      const merged = mergeAttachments(parseMentionTokens(trimmed), attachments);
      const rawKey = buildScopePreheatKey(trimmed, merged);
      const key = this.app.speculative.makeKey('scopePreheat', { key: rawKey });
      this.app.speculative.discardExcept(key);
      const estimatedTokens = estimateTokens(trimmed) + 128;
      this.app.speculative.schedule('scopePreheat', key, estimatedTokens, async () =>
        runScopePreheat(this.app, trimmed, merged)
      );
    }, 300);
  }

  syncStage(_stage: WorkflowStage): void {
    void this.syncWebviewState();
  }

  private buildLabels(): ConversationLabels {
    return {
      userPrefix: t('conversation.userPrefix'),
      assistantPrefix: t('conversation.assistantPrefix'),
      summarized: t('conversation.summarized', '{path}'),
      streamComplete: t('conversation.streamComplete'),
      streamCancelled: t('conversation.streamCancelled'),
      streamError: t('conversation.streamError', '{msg}'),
      removeAttachment: t('conversation.removeAttachment'),
      inputLabel: t('conversation.inputLabel'),
      inputPlaceholder: t('conversation.inputPlaceholder'),
      send: t('conversation.send'),
      sendAria: t('conversation.sendAria'),
      attach: t('conversation.attach'),
      attachAria: t('conversation.attachAria'),
      cancel: t('conversation.cancel'),
      cancelAria: t('conversation.cancelAria'),
      newSession: t('conversation.newSession'),
      newSessionAria: t('conversation.newSessionAria'),
      designStepLabel: t('design.stepLabel'),
      continueLabel: t('design.continueLabel'),
      continueAria: t('design.continueAria'),
      pickStepLabel: t('design.pickStepLabel'),
      pickStepAria: t('design.pickStepAria'),
      pickStepPlaceHolder: t('design.pickStepPlaceHolder'),
      stepComplete: t('design.stepComplete'),
      stepCurrent: t('design.currentStep'),
      selectModel: t('models.selectModel'),
      selectModelAria: t('models.selectModelAria'),
      noModelsAvailable: t('models.noModelsAvailable'),
    };
  }

  private async syncWebviewState(options?: { resetMessages?: boolean }): Promise<void> {
    if (!this.panel) {
      return;
    }
    const stage = this.app.stages.getStage();
    const readOnly = stage !== 'Design';
    const design = await this.app.designWorkflow.getState();
    const modelHeader = this.app.platform.models.getHeaderState();
    const payload: ConversationStateSync = {
      type: 'stateSync',
      stage,
      readOnly,
      readOnlyBanner: readOnly ? t('conversation.readOnlyBanner', stage) : undefined,
      model: this.app.platform.models.getSelected()?.name ?? 'none',
      ...modelHeader,
      designStep: design.currentStepLabel,
      designCanContinue: design.canContinue,
      designContinueBlockedReason: design.continueBlockedReason,
      designIsFinalStep: design.isFinalStep,
      designSteps: design.steps.map((step) => ({
        id: step.id,
        label: step.label,
        complete: step.complete,
        missing: step.missing,
        current: step.current,
      })),
      tokens: this.sessionTokens,
      tokenCap: resolveEffectiveSessionCap(
        this.app.platform.models.getSelected()?.maxInputTokens,
        this.app.platform.getSettings().sessionTokenCap,
        resolveContextTier(
          this.app.platform.models.getSelected()?.maxInputTokens,
          this.app.platform.getSettings().tierOverride
        )
      ),
      contextTier: resolveContextTier(
        this.app.platform.models.getSelected()?.maxInputTokens,
        this.app.platform.getSettings().tierOverride
      ),
      labels: this.buildLabels(),
      resetMessages: options?.resetMessages,
    };
    this.postMessage(payload);
  }

  private async handleContinueDesign(): Promise<void> {
    if (this.app.stages.getStage() !== 'Design') {
      return;
    }
    const result = await this.app.designWorkflow.continueToNextStep();
    if (result.ok && result.nextStep) {
      await this.app.designWorkflow.refreshPanelsForStep(result.nextStep);
    }
    await this.syncWebviewState();
  }

  private async handlePickDesignStep(step: string): Promise<void> {
    if (this.app.stages.getStage() !== 'Design') {
      return;
    }
    const picked = await this.app.designWorkflow.pickStep(step);
    if (picked && isDesignWorkflowStep(step)) {
      await this.app.designWorkflow.refreshPanelsForStep(step);
    }
    await this.syncWebviewState();
  }

  private async handleSubmit(text: string, webAttachments: MentionAttachment[]): Promise<void> {
    this.app.backgroundAgent.recordActivity();
    const stage = this.app.stages.getStage();
    if (stage !== 'Design') {
      return;
    }
    if (this.app.platform.network.isOffline()) {
      void vscode.window.showWarningMessage(t('conversation.offline'));
      return;
    }
    if (!this.app.platform.models.hasModels()) {
      await this.app.platform.auth.promptSignIn();
      this.postMessage({ type: 'error', message: t('models.noModelsAvailable') });
      return;
    }

    const slash = parseSlashSkill(text);
    let userText = slash.message || text;
    if (slash.skillId) {
      userText = slash.message || '(skill attached)';
    }

    const attachments = mergeAttachments(parseMentionTokens(userText), [
      ...this.pendingAttachments,
      ...webAttachments,
      ...(slash.skillId
        ? [{ kind: 'skill' as const, target: slash.skillId, label: slash.skillId }]
        : []),
    ]);
    this.pendingAttachments = [];

    const systemDoc = this.app.docs.getEntries().find((e) => e.valid && e.frontmatter.level === 'system');
    const autoSkills = this.app.skills.getAutoAttached(systemDoc?.relativePath, systemDoc?.frontmatter.id);
    const skillPrefix = this.app.skills.formatInstructions(autoSkills);

    const model = await this.app.platform.models.resolveSelectionForSurface('primaryAgent');
    const settings = this.app.platform.getSettings();
    const tier = resolveContextTier(model?.maxInputTokens, settings.tierOverride);
    const tokenBudget = resolveTokenBudget(model?.maxInputTokens, settings.sessionTokenCap);
    const sessionCap = resolveEffectiveSessionCap(model?.maxInputTokens, settings.sessionTokenCap, tier);

    if (this.sessionTokens >= sessionCap) {
      void vscode.window.showWarningMessage(t('conversation.sessionCapReached', String(sessionCap)));
      this.postMessage({ type: 'error', message: t('conversation.sessionCapReached', String(sessionCap)) });
      return;
    }

    const docEntries = this.app.docs.getEntries();
    const scopeDocPath =
      systemDoc?.relativePath ??
      docEntries.find((e) => e.valid && e.frontmatter.level === 'system')?.relativePath;

    let mentionPrefix: string | undefined;
    if (attachments.length > 0) {
      const blocks = await resolveMentionBlocks(attachments, this.app, tokenBudget);
      const activeBlocks = blocks.filter((b) => !b.blocked);
      const budget = estimateAttachmentsBudget(
        activeBlocks.map((b) => b.text),
        userText,
        tokenBudget
      );
      if (budget.exceedsBudget) {
        const sendAnyway = t('mentions.budgetSendAnyway');
        const choice = await vscode.window.showWarningMessage(
          t('mentions.budgetExceeded', String(budget.estimatedTokens), String(tokenBudget)),
          { modal: true },
          sendAnyway,
          t('common.cancel')
        );
        if (choice !== sendAnyway) {
          return;
        }
      }
      mentionPrefix = activeBlocks.map((b) => b.text).join('\n\n');
    }

    const preheatRawKey = buildScopePreheatKey(userText, attachments);
    const preheatKey = this.app.speculative.makeKey('scopePreheat', { key: preheatRawKey });
    const preheated = this.app.speculative.tryConsume<string>(preheatKey);

    const contextItems = [];
    const mentionParts = [mentionPrefix, skillPrefix].filter(Boolean);
    if (mentionParts.length) {
      contextItems.push(contextItem('mentions', mentionParts.join('\n\n')));
    }

    if (scopeDocPath) {
      const settings = this.app.platform.getSettings();
      const scope = resolveScope(scopeDocPath, docEntries, 100, {
        maxLateralDepth: settings.maxLateralDepth,
        resolveId: (id) => this.app.namingAliases.resolve(id),
      });
      void this.app.docs.touchLastReferenced(scope.map((s) => s.document_path));
      const layerWalk = buildLayerWalkForDoc(scopeDocPath, docEntries, tier);
      const layerText = layerWalk.map((entry) => `### ${entry.documentPath}\n${entry.content}`).join('\n\n');
      if (layerText.trim()) {
        contextItems.push(contextItem('layerWalk', layerText));
      }
    }

    const frontmatterBlock = buildModuleFrontmatterContext(docEntries, tier);
    if (frontmatterBlock.trim()) {
      contextItems.push(contextItem('layerWalk', frontmatterBlock));
    }

    const knowledgeBlock = await this.app.knowledge.buildContextBlock(undefined, undefined, tier);
    if (knowledgeBlock.trim()) {
      contextItems.push(contextItem('layerWalk', knowledgeBlock));
    }

    if (preheated?.hit && preheated.value.trim()) {
      contextItems.push(contextItem('ragRetrievals', preheated.value));
    }

    const editor = vscode.window.activeTextEditor;
    if (editor && !editor.selection.isEmpty) {
      contextItems.push(contextItem('selection', editor.document.getText(editor.selection)));
    }
    if (editor) {
      contextItems.push(
        contextItem(
          'currentFile',
          `# ${vscode.workspace.asRelativePath(editor.document.uri)}\n${editor.document.getText().slice(0, 50_000)}`
        )
      );
    }

    const systemPrompt = await this.app.primaryAgent.ensurePrompt();
    const reservedTokens = estimateTokens(systemPrompt) + estimateTokens(userText);
    const assembled = fitContextToBudget(contextItems, Math.max(tokenBudget - reservedTokens, 0));

    if (assembled.blocked) {
      const message = assembled.blockReason ?? t('conversation.contextItemTooLarge', 'context');
      void vscode.window.showWarningMessage(message);
      this.postMessage({ type: 'error', message });
      return;
    }

    let contextPrefix = assembled.included.map((item) => item.text).join('\n\n') || undefined;
    if (hasDroppedContext(assembled.dropped)) {
      const notice = formatContextDropSummary(assembled.dropped);
      this.postMessage({ type: 'contextDropped', notice });
    }

    await this.sessions.appendUserMessage(slash.skillId ? `/${slash.skillId} ${userText}`.trim() : text);
    this.postMessage({ type: 'userMessage', text, attachments });

    this.cancelSource?.cancel();
    this.cancelSource = new vscode.CancellationTokenSource();
    const requestRegistration = this.app.platform.modelRequests.register(this.cancelSource);
    this.postMessage({ type: 'streamStart' });

    try {
      const prepared = await this.app.summarizer.prepareHistory(
        this.sessions.getMessages().slice(0, -1),
        userText,
        contextPrefix,
        systemPrompt,
        this.cancelSource.token,
        this.sessions,
        contextItems
      );

      if (prepared.blocked) {
        this.postMessage({ type: 'error', message: prepared.blockReason ?? t('conversation.requestBlocked') });
        void vscode.window.showWarningMessage(prepared.blockReason ?? t('conversation.requestBlocked'));
        return;
      }

      if (prepared.summaryPath) {
        this.postMessage({ type: 'summarized', path: prepared.summaryPath });
      }

      const result = await this.app.primaryAgent.runDesignTurn(
        userText,
        prepared.history,
        this.cancelSource.token,
        (chunk) => this.postMessage({ type: 'streamChunk', text: chunk }),
        contextPrefix,
        (status) => this.postMessage({ type: 'designStatus', message: status })
      );

      if (result.cancelled) {
        this.postMessage({ type: 'streamCancelled' });
        return;
      }

      await this.sessions.appendAssistantMessage(result.text);
      this.sessionTokens += result.inputTokens + result.outputTokens;
      this.postMessage({
        type: 'streamEnd',
        text: result.text,
        tokens: this.sessionTokens,
        designStep: result.designStep,
        delegatedRole: result.delegatedRole,
      });
      await this.syncWebviewState();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.postMessage({ type: 'error', message });
      void vscode.window.showErrorMessage(message);
    } finally {
      requestRegistration.dispose();
    }
  }

  private postMessage(msg: unknown): void {
    void this.panel?.webview.postMessage(msg);
  }
}
