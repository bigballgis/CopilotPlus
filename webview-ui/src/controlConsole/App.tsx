import { useEffect, useState } from 'react';
import { VSCodeButton, VSCodeDropdown, VSCodeOption } from '@vscode/webview-ui-toolkit/react';
import type {
  ControlConsoleHostMessage,
  ControlConsoleLabels,
  ControlConsoleStateSync,
} from '@shared/controlConsoleWebviewProtocol';
import { ActionBar } from '@ui/components/ActionBar';
import { CollapsibleSection } from '@ui/components/CollapsibleSection';
import { Icon } from '@ui/components/Icon';
import { StatusChip } from '@ui/components/StatusChip';
import { postToHost } from '../shared/vscode';

const EMPTY_LABELS: ControlConsoleLabels = {
  expandSection: 'Expand {0}',
  collapseSection: 'Collapse {0}',
  labelModel: 'Model',
  labelContextTier: 'Context tier',
  labelOffline: 'Offline',
  labelPerfBudget: 'Perf budget',
  labelAutonomy: 'Autonomy',
  selectAutonomy: 'Autonomy level',
  selectAutonomyAria: 'Select autonomy level',
  labelMode: 'Mode',
  labelAddon: 'Add-on',
  labelEmbeddedChunks: 'Embedded chunks',
  labelCode: 'Code',
  labelDocs: 'Docs',
  toolsCount: '{0} tool(s)',
  invalidSkill: 'invalid',
  ariaStatus: 'Status',
  ariaWorkflow: 'Workflow Stage',
  ariaHierarchy: 'Hierarchy',
  ariaIndexing: 'Indexing',
  ariaSkills: 'Skills',
  ariaMcp: 'MCP Servers',
  ariaMemory: 'Memory',
  ariaModels: 'Models',
  ariaSettings: 'Settings',
  initAgents: 'Initialize AGENTS.md',
  rebuildIndex: 'Rebuild index',
  downloadAddon: 'Download embedding add-on',
  mirrorUrlHint: 'Mode B requires enterprise mirror URL in settings.',
  noSkills: 'No skills yet.',
  createSkill: 'Create Skill',
  disableSkill: 'Disable',
  enableSkill: 'Enable',
  configureMcp: 'Configure .copilotPlus/mcp.json',
  reconnectMcp: 'Reconnect',
  noMemory: 'No session memory entries.',
  pinMemory: 'Pin',
  unpinMemory: 'Unpin',
  removeMemory: 'Remove',
  reflectionSummary: 'Reflection summary',
  noReflection: 'No recent build reflections.',
  selectModel: 'Select model',
  selectModelAria: 'Select model',
  openSettings: 'Open Settings',
  openSettingsAria: 'Open settings',
  runConsistencyCheck: 'Run consistency check',
  runConsistencyCheckAria: 'Run document layer consistency check',
  openDriftView: 'Open drift view',
  openDriftViewAria: 'Open drift resolution view',
  resolveAllDrift: 'Resolve all',
  labelPendingQueue: 'Pending queue',
  labelUpdatePending: 'Update pending',
  labelDriftSuspected: 'Drift suspected',
  labelOrphanCode: 'Orphan code',
  labelOwnershipConflict: 'Ownership conflicts',
  noDriftItems: 'No open drift items.',
  yes: 'yes',
  no: 'no',
  labelDecisions: 'Pending decisions',
  noDecisions: 'No pending decisions.',
  decisionRemaining: '{0}s remaining',
  bulkApproveDefault: 'Approve all (default)',
  bulkApproveDefaultAria: 'Apply default option to all pending decisions',
  resolveDecision: 'Respond',
};

const EMPTY_SYNC: ControlConsoleStateSync = {
  type: 'stateSync',
  labels: EMPTY_LABELS,
  status: {
    model: 'none',
    contextTier: 'S',
    offline: false,
    nesStatus: '',
    perfBudgetMs: 5000,
    backgroundEnabled: false,
    backgroundPhase: 'idle',
    backgroundElapsedSec: 0,
    backgroundIdleForSec: 0,
    pendingDecisions: 0,
  },
  decisions: [],
  workflow: { stage: 'Design', autonomy: 'Approve_Edits', autonomyLevels: ['Manual', 'Approve_Edits', 'Approve_Commands', 'Full_Auto'] },
  hierarchy: {
    counts: { updatePending: 0, driftSuspected: 0, orphanCode: 0, ownershipConflict: 0, pendingQueue: 0 },
    items: [],
  },
  indexing: {
    embeddingMode: 'sparse_only',
    codeStatus: 'idle',
    codeChunks: 0,
    docsStatus: 'idle',
    docChunks: 0,
    showDownloadAddon: false,
  },
  skills: [],
  mcp: [],
  memory: [],
  reflections: [],
};

export function App(): JSX.Element {
  const [state, setState] = useState<ControlConsoleStateSync>(EMPTY_SYNC);

  useEffect(() => {
    postToHost({ type: 'ready' });
    const onMessage = (event: MessageEvent<ControlConsoleHostMessage>) => {
      if (event.data?.type === 'stateSync') {
        setState(event.data);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const L = state.labels;

  return (
    <div className="cp-root cp-console-root">
      <CollapsibleSection
        sectionId="status"
        title={L.ariaStatus}
        ariaLabel={L.ariaStatus}
        expandLabel={L.expandSection}
        collapseLabel={L.collapseSection}
        defaultOpen
      >
        <div className="cp-status-row">
          <StatusChip label={L.labelModel} value={state.status.model} />
          <StatusChip label={L.labelContextTier} value={state.status.contextTier} />
          <StatusChip
            label={L.labelOffline}
            value={state.status.offline ? L.yes : L.no}
          />
        </div>
        <p className="cp-console-row">{state.status.nesStatus}</p>
        <p className="cp-meta">
          {L.labelPerfBudget}: activation ≤ {state.status.perfBudgetMs}ms
        </p>
        <div className="cp-status-row">
          <StatusChip label={L.labelDecisions} value={String(state.status.pendingDecisions)} />
        </div>
        {state.decisions.length > 0 ? (
          <>
            <ActionBar>
              <VSCodeButton
                aria-label={L.bulkApproveDefaultAria}
                onClick={() => postToHost({ type: 'bulkApproveDecisions' })}
              >
                {L.bulkApproveDefault}
              </VSCodeButton>
            </ActionBar>
            <ul className="cp-decision-list">
              {state.decisions.map((entry) => (
                <li key={entry.id} className="cp-decision-item">
                  <p className="cp-meta">
                    <strong>{entry.taskId ?? '(no task)'}</strong> ·{' '}
                    {L.decisionRemaining.replace('{0}', String(entry.remainingSec))}
                  </p>
                  <p>{entry.question}</p>
                  <ActionBar>
                    {entry.options.map((option) => (
                      <VSCodeButton
                        key={option}
                        appearance="secondary"
                        aria-label={`${L.resolveDecision}: ${option}`}
                        onClick={() =>
                          postToHost({ type: 'resolveDecision', id: entry.id, selected: option })
                        }
                      >
                        {option}
                      </VSCodeButton>
                    ))}
                  </ActionBar>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="cp-meta">{L.noDecisions}</p>
        )}
        <ActionBar>
          <VSCodeButton aria-label={L.initAgents} onClick={() => postToHost({ type: 'initAgents' })}>
            <Icon name="book" />
            {L.initAgents}
          </VSCodeButton>
        </ActionBar>
      </CollapsibleSection>

      <CollapsibleSection
        sectionId="workflow"
        title={L.ariaWorkflow}
        ariaLabel={L.ariaWorkflow}
        expandLabel={L.expandSection}
        collapseLabel={L.collapseSection}
        defaultOpen
      >
        <div className="cp-status-row">
          <StatusChip label={L.ariaWorkflow} value={state.workflow.stage} />
        </div>
        <label className="cp-console-row">
          {L.selectAutonomy}
          <VSCodeDropdown
            aria-label={L.selectAutonomyAria}
            value={state.workflow.autonomy}
            onChange={(e) => {
              const target = e.target as HTMLSelectElement;
              postToHost({ type: 'setAutonomy', level: target.value });
            }}
          >
            {state.workflow.autonomyLevels.map((level) => (
              <VSCodeOption key={level} value={level}>
                {level}
              </VSCodeOption>
            ))}
          </VSCodeDropdown>
        </label>
      </CollapsibleSection>

      <CollapsibleSection
        sectionId="hierarchy"
        title={L.ariaHierarchy}
        ariaLabel={L.ariaHierarchy}
        expandLabel={L.expandSection}
        collapseLabel={L.collapseSection}
        defaultOpen
      >
        <div className="cp-status-row">
          <StatusChip label={L.labelPendingQueue} value={String(state.hierarchy.counts.pendingQueue)} />
          <StatusChip label={L.labelUpdatePending} value={String(state.hierarchy.counts.updatePending)} />
          <StatusChip label={L.labelDriftSuspected} value={String(state.hierarchy.counts.driftSuspected)} />
          <StatusChip label={L.labelOrphanCode} value={String(state.hierarchy.counts.orphanCode)} />
          <StatusChip
            label={L.labelOwnershipConflict}
            value={String(state.hierarchy.counts.ownershipConflict)}
          />
        </div>
        <ActionBar>
          <VSCodeButton
            aria-label={L.runConsistencyCheckAria}
            onClick={() => postToHost({ type: 'runConsistencyCheck' })}
          >
            {L.runConsistencyCheck}
          </VSCodeButton>
          <VSCodeButton
            appearance="secondary"
            aria-label={L.openDriftViewAria}
            onClick={() => postToHost({ type: 'openDriftView' })}
          >
            {L.openDriftView}
          </VSCodeButton>
          {state.hierarchy.items.length > 0 ? (
            <VSCodeButton
              appearance="secondary"
              aria-label={L.resolveAllDrift}
              onClick={() => postToHost({ type: 'resolveAllDrift' })}
            >
              {L.resolveAllDrift}
            </VSCodeButton>
          ) : null}
        </ActionBar>
        {state.hierarchy.items.length === 0 ? (
          <p className="cp-meta">{L.noDriftItems}</p>
        ) : (
          <ul className="cp-console-list">
            {state.hierarchy.items.map((item) => (
              <li key={item.id} className="cp-console-row">
                <span>
                  <strong>{item.type}</strong> — {item.target}
                </span>
                <ActionBar>
                  <VSCodeButton
                    appearance="secondary"
                    aria-label={`Resolve ${item.id}`}
                    onClick={() => postToHost({ type: 'resolveDrift', id: item.id })}
                  >
                    Resolve
                  </VSCodeButton>
                  <VSCodeButton
                    appearance="secondary"
                    aria-label={`Dismiss ${item.id}`}
                    onClick={() => postToHost({ type: 'dismissDrift', id: item.id })}
                  >
                    Dismiss
                  </VSCodeButton>
                </ActionBar>
              </li>
            ))}
          </ul>
        )}
      </CollapsibleSection>

      <CollapsibleSection
        sectionId="indexing"
        title={L.ariaIndexing}
        ariaLabel={L.ariaIndexing}
        expandLabel={L.expandSection}
        collapseLabel={L.collapseSection}
      >
        <p className="cp-console-row">
          {L.labelMode}: {state.indexing.embeddingMode}
          {state.indexing.embeddingModelId ? ` (${state.indexing.embeddingModelId})` : ''}
        </p>
        {state.indexing.embeddingAddonVersion ? (
          <p className="cp-console-row">
            {L.labelAddon}: {state.indexing.embeddingAddonVersion}
          </p>
        ) : null}
        {state.indexing.embeddedChunks != null ? (
          <p className="cp-console-row">
            {L.labelEmbeddedChunks}: {state.indexing.embeddedChunks}
          </p>
        ) : null}
        {state.indexing.embeddingNotice ? (
          <p className="cp-meta">{state.indexing.embeddingNotice}</p>
        ) : null}
        <p className="cp-console-row">
          {L.labelCode}: {state.indexing.codeStatus} ({state.indexing.codeChunks} chunks)
        </p>
        <p className="cp-console-row">
          {L.labelDocs}: {state.indexing.docsStatus} ({state.indexing.docChunks} chunks)
        </p>
        {state.indexing.lastError ? (
          <p className="cp-console-error">{state.indexing.lastError}</p>
        ) : null}
        <ActionBar>
          <VSCodeButton aria-label={L.rebuildIndex} onClick={() => postToHost({ type: 'rebuildIndex' })}>
            <Icon name="refresh" />
            {L.rebuildIndex}
          </VSCodeButton>
          {state.indexing.showDownloadAddon ? (
            <VSCodeButton
              appearance="secondary"
              aria-label={L.downloadAddon}
              onClick={() => postToHost({ type: 'downloadEmbeddingAddon' })}
            >
              {L.downloadAddon}
            </VSCodeButton>
          ) : (
            <p className="cp-meta">{L.mirrorUrlHint}</p>
          )}
        </ActionBar>
      </CollapsibleSection>

      <CollapsibleSection
        sectionId="skills"
        title={L.ariaSkills}
        ariaLabel={L.ariaSkills}
        expandLabel={L.expandSection}
        collapseLabel={L.collapseSection}
      >
        {state.skills.length === 0 ? (
          <p className="cp-meta">{L.noSkills}</p>
        ) : (
          state.skills.map((skill) => (
            <div key={skill.id} className="cp-console-list-item">
              <VSCodeButton
                appearance="secondary"
                aria-label={`${skill.enabled ? L.disableSkill : L.enableSkill} ${skill.title}`}
                onClick={() => postToHost({ type: 'toggleSkill', id: skill.id })}
              >
                {skill.enabled ? L.disableSkill : L.enableSkill}
              </VSCodeButton>
              <span>
                {skill.title} <span className="cp-meta">({skill.scope})</span>
                {!skill.valid ? <span className="cp-console-error"> {L.invalidSkill}</span> : null}
              </span>
            </div>
          ))
        )}
        <ActionBar>
          <VSCodeButton appearance="secondary" aria-label={L.createSkill} onClick={() => postToHost({ type: 'createSkill' })}>
            <Icon name="add" />
            {L.createSkill}
          </VSCodeButton>
        </ActionBar>
      </CollapsibleSection>

      <CollapsibleSection
        sectionId="mcp"
        title={L.ariaMcp}
        ariaLabel={L.ariaMcp}
        expandLabel={L.expandSection}
        collapseLabel={L.collapseSection}
      >
        {state.mcp.length === 0 ? (
          <p className="cp-meta">{L.configureMcp}</p>
        ) : (
          state.mcp.map((server) => (
            <div key={server.id} className="cp-console-list-item">
              <strong>{server.id}</strong>
              <span className="cp-meta">
                · {server.state} · {L.toolsCount.replace('{0}', String(server.toolCount))}
              </span>
              {server.lastError ? <p className="cp-console-error">{server.lastError}</p> : null}
              {server.canReconnect ? (
                <VSCodeButton
                  appearance="secondary"
                  aria-label={`${L.reconnectMcp} ${server.id}`}
                  onClick={() => postToHost({ type: 'reconnectMcp', id: server.id })}
                >
                  {L.reconnectMcp}
                </VSCodeButton>
              ) : null}
            </div>
          ))
        )}
      </CollapsibleSection>

      <CollapsibleSection
        sectionId="memory"
        title={L.ariaMemory}
        ariaLabel={L.ariaMemory}
        expandLabel={L.expandSection}
        collapseLabel={L.collapseSection}
      >
        {state.memory.length === 0 ? (
          <p className="cp-meta">{L.noMemory}</p>
        ) : (
          state.memory.map((entry) => (
            <div key={entry.id} className="cp-console-list-item">
              <VSCodeButton
                appearance="secondary"
                aria-label={entry.pinned ? L.unpinMemory : L.pinMemory}
                onClick={() => postToHost({ type: 'pinMemory', id: entry.id })}
              >
                {entry.pinned ? L.unpinMemory : L.pinMemory}
              </VSCodeButton>
              <VSCodeButton
                appearance="secondary"
                aria-label={L.removeMemory}
                onClick={() => postToHost({ type: 'removeMemory', id: entry.id })}
              >
                {L.removeMemory}
              </VSCodeButton>
              <span>
                {entry.text}
                <span className="cp-meta"> ({entry.scope})</span>
              </span>
            </div>
          ))
        )}
        <h4 className="cp-console-subheading">{L.reflectionSummary}</h4>
        {state.reflections.length === 0 ? (
          <p className="cp-meta">{L.noReflection}</p>
        ) : (
          state.reflections.map((line, index) => (
            <div key={`${index}-${line.slice(0, 24)}`} className="cp-console-reflection">
              {line}
            </div>
          ))
        )}
      </CollapsibleSection>

      <CollapsibleSection
        sectionId="models"
        title={L.ariaModels}
        ariaLabel={L.ariaModels}
        expandLabel={L.expandSection}
        collapseLabel={L.collapseSection}
        defaultOpen
      >
        <ActionBar>
          <VSCodeButton aria-label={L.selectModelAria} onClick={() => postToHost({ type: 'selectModel' })}>
            <Icon name="hubot" />
            {L.selectModel}
          </VSCodeButton>
        </ActionBar>
      </CollapsibleSection>

      <CollapsibleSection
        sectionId="settings"
        title={L.ariaSettings}
        ariaLabel={L.ariaSettings}
        expandLabel={L.expandSection}
        collapseLabel={L.collapseSection}
        defaultOpen
      >
        <ActionBar>
          <VSCodeButton appearance="secondary" aria-label={L.openSettingsAria} onClick={() => postToHost({ type: 'openSettings' })}>
            <Icon name="settings-gear" />
            {L.openSettings}
          </VSCodeButton>
        </ActionBar>
      </CollapsibleSection>
    </div>
  );
}
