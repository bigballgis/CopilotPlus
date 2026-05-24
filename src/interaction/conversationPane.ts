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
  resolveMentionContext,
  type MentionAttachment,
} from '../context/mentions';
import { buildScopePreheatKey, runScopePreheat } from '../context/scopePreheat';
import { estimateTokens } from '../platform/chatClient';
import { t } from '../platform/l10n';

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
    };
  }

  private async syncWebviewState(options?: { resetMessages?: boolean }): Promise<void> {
    if (!this.panel) {
      return;
    }
    const stage = this.app.stages.getStage();
    const readOnly = stage !== 'Design';
    const design = await this.app.designWorkflow.getState();
    const payload: ConversationStateSync = {
      type: 'stateSync',
      stage,
      readOnly,
      readOnlyBanner: readOnly ? t('conversation.readOnlyBanner', stage) : undefined,
      model: this.app.platform.models.getSelected()?.name ?? 'none',
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
    if (result.ok) {
      await this.syncWebviewState();
    }
  }

  private async handlePickDesignStep(step: string): Promise<void> {
    if (this.app.stages.getStage() !== 'Design') {
      return;
    }
    const picked = await this.app.designWorkflow.pickStep(step);
    if (picked) {
      await this.syncWebviewState();
    }
  }

  private async handleSubmit(text: string, webAttachments: MentionAttachment[]): Promise<void> {
    const stage = this.app.stages.getStage();
    if (stage !== 'Design') {
      return;
    }
    if (this.app.platform.network.isOffline()) {
      void vscode.window.showWarningMessage(t('conversation.offline'));
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

    let contextPrefix =
      attachments.length > 0
        ? await resolveMentionContext(attachments, this.app, this.app.platform.getSettings().sessionTokenCap)
        : undefined;

    const preheatRawKey = buildScopePreheatKey(userText, attachments);
    const preheatKey = this.app.speculative.makeKey('scopePreheat', { key: preheatRawKey });
    const preheated = this.app.speculative.tryConsume<string>(preheatKey);
    if (preheated?.hit && preheated.value.trim()) {
      contextPrefix = contextPrefix
        ? `${preheated.value}\n\n${contextPrefix}`
        : preheated.value;
    }

    if (skillPrefix) {
      contextPrefix = contextPrefix ? `${skillPrefix}\n\n${contextPrefix}` : skillPrefix;
    }

    await this.sessions.appendUserMessage(slash.skillId ? `/${slash.skillId} ${userText}`.trim() : text);
    this.postMessage({ type: 'userMessage', text, attachments });

    this.cancelSource?.cancel();
    this.cancelSource = new vscode.CancellationTokenSource();
    this.postMessage({ type: 'streamStart' });

    try {
      const systemPrompt = await this.app.primaryAgent.ensurePrompt();
      const prepared = await this.app.summarizer.prepareHistory(
        this.sessions.getMessages().slice(0, -1),
        userText,
        contextPrefix,
        systemPrompt,
        this.cancelSource.token,
        this.sessions
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
    }
  }

  private postMessage(msg: unknown): void {
    void this.panel?.webview.postMessage(msg);
  }
}
