/** Build serializable Control Console snapshot for React webview — R-INT-9 */

import type { AppServices } from '../app/appServices';
import { resolveContextTier } from '../context/contextTier';
import { describeNesDelegateStatus, getCopilotExtensionProbe } from '../editing/nesDelegate';
import { PLAT5 } from '../platform/performanceBudget';
import { t } from '../platform/l10n';
import type { ControlConsoleLabels, ControlConsoleStateSync } from '../shared/controlConsoleWebviewProtocol';

export function buildControlConsoleLabels(): ControlConsoleLabels {
  return {
    expandSection: t('controlConsole.expandSection', '{0}'),
    collapseSection: t('controlConsole.collapseSection', '{0}'),
    labelModel: t('controlConsole.labelModel'),
    labelContextTier: t('controlConsole.labelContextTier'),
    labelOffline: t('controlConsole.labelOffline'),
    labelPerfBudget: t('controlConsole.labelPerfBudget'),
    labelBackground: t('controlConsole.labelBackground'),
    backgroundIdle: t('controlConsole.backgroundIdle', '{0}', '{1}'),
    backgroundRunning: t('controlConsole.backgroundRunning', '{0}', '{1}'),
    backgroundPaused: t('controlConsole.backgroundPaused', '{0}'),
    backgroundDisabled: t('controlConsole.backgroundDisabled'),
    labelAutonomy: t('controlConsole.labelAutonomy'),
    selectAutonomy: t('controlConsole.selectAutonomy'),
    selectAutonomyAria: t('controlConsole.selectAutonomyAria'),
    labelMode: t('controlConsole.labelMode'),
    labelAddon: t('controlConsole.labelAddon'),
    labelEmbeddedChunks: t('controlConsole.labelEmbeddedChunks'),
    labelCode: t('controlConsole.labelCode'),
    labelDocs: t('controlConsole.labelDocs'),
    toolsCount: t('controlConsole.toolsCount', '{0}'),
    invalidSkill: t('controlConsole.invalidSkill'),
    ariaStatus: t('controlConsole.aria.status'),
    ariaWorkflow: t('controlConsole.aria.workflow'),
    ariaIndexing: t('controlConsole.aria.indexing'),
    ariaSkills: t('controlConsole.aria.skills'),
    ariaMcp: t('controlConsole.aria.mcp'),
    ariaMemory: t('controlConsole.aria.memory'),
    ariaModels: t('controlConsole.aria.models'),
    ariaSettings: t('controlConsole.aria.settings'),
    initAgents: t('controlConsole.initAgents'),
    rebuildIndex: t('controlConsole.rebuildIndex'),
    downloadAddon: t('controlConsole.downloadAddon'),
    mirrorUrlHint: t('controlConsole.mirrorUrlHint'),
    noSkills: t('controlConsole.noSkills'),
    createSkill: t('controlConsole.createSkill'),
    disableSkill: t('controlConsole.disableSkill'),
    enableSkill: t('controlConsole.enableSkill'),
    configureMcp: t('controlConsole.configureMcp'),
    reconnectMcp: t('controlConsole.reconnectMcp'),
    noMemory: t('controlConsole.noMemory'),
    pinMemory: t('controlConsole.pinMemory'),
    unpinMemory: t('controlConsole.unpinMemory'),
    removeMemory: t('controlConsole.removeMemory'),
    reflectionSummary: t('controlConsole.reflectionSummary'),
    noReflection: t('controlConsole.noReflection'),
    selectModel: t('controlConsole.selectModel'),
    selectModelAria: t('controlConsole.selectModelAria'),
    openSettings: t('controlConsole.openSettings'),
    openSettingsAria: t('controlConsole.openSettingsAria'),
    yes: t('common.yes'),
    no: t('common.no'),
  };
}

export function buildControlConsoleStateSync(app: AppServices): ControlConsoleStateSync {
  const s = app.platform.getSettings();
  const model = app.platform.models.getSelected();
  const idx = app.indexManager.getState();
  const nes = describeNesDelegateStatus(s, getCopilotExtensionProbe());
  const nesStatus =
    nes.mode === 'disabled'
      ? t('nes.statusDisabled')
      : !nes.copilotDetected
        ? t('nes.statusDelegateMissing')
        : nes.copilotActive
          ? t('nes.statusDelegateActive')
          : t('nes.statusDelegateInactive');

  const bg = app.backgroundAgent.getStatus();
  const backgroundTask = bg.currentTask ?? bg.pausedTask;
  const backgroundLastFinding = bg.lastFinding;

  return {
    type: 'stateSync',
    labels: buildControlConsoleLabels(),
    status: {
      model: model?.name ?? 'none',
      contextTier: resolveContextTier(model?.maxInputTokens, s.tierOverride),
      offline: app.platform.network.isOffline(),
      nesStatus,
      perfBudgetMs: PLAT5.activationTargetMs,
      backgroundEnabled: bg.enabled,
      backgroundPhase: bg.phase,
      backgroundTask,
      backgroundElapsedSec: bg.elapsedSec,
      backgroundIdleForSec: bg.idleForSec,
      backgroundLastFinding,
    },
    workflow: {
      stage: app.stages.getStage(),
      autonomy: s.autonomyLevel,
      autonomyLevels: ['Manual', 'Approve_Edits', 'Approve_Commands', 'Full_Auto'],
    },
    indexing: {
      embeddingMode: idx.embeddingMode,
      embeddingModelId: idx.embeddingModelId,
      embeddingAddonVersion: idx.embeddingAddonVersion,
      embeddedChunks: idx.embeddedChunks,
      embeddingNotice: idx.embeddingNotice,
      codeStatus: idx.code,
      codeChunks: idx.codeChunks,
      docsStatus: idx.docs,
      docChunks: idx.docChunks,
      lastError: idx.lastError,
      showDownloadAddon: Boolean(s.embeddingAddonUrl),
    },
    skills: app.skills.getSkills().map((skill) => ({
      id: skill.id,
      title: skill.title,
      scope: skill.scope,
      enabled: skill.enabled,
      valid: skill.valid,
    })),
    mcp: app.mcp.getServers().map((server) => ({
      id: server.config.id,
      state: server.state,
      toolCount: server.tools.length,
      lastError: server.lastError,
      canReconnect: server.state === 'error' || server.state === 'disconnected',
    })),
    memory: app.knowledge
      .getSessionEntries()
      .slice(0, 12)
      .map((entry) => ({
        id: entry.id,
        text: entry.text.slice(0, 120),
        scope: entry.scope,
        pinned: entry.pinned,
      })),
    reflections: app.knowledge.getReflectionSummaries(),
  };
}
