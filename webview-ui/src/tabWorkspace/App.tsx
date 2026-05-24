import { useEffect, useState } from 'react';
import { VSCodeButton, VSCodeTextArea } from '@vscode/webview-ui-toolkit/react';
import type {
  DocTreeNodeWire,
  TabId,
  TabWorkspaceHostMessage,
  TabWorkspaceLabels,
  TabWorkspaceStateSync,
} from '@shared/tabWorkspaceWebviewProtocol';
import { TAB_IDS } from '@shared/tabWorkspaceWebviewProtocol';
import { ActionBar } from '@ui/components/ActionBar';
import { Icon } from '@ui/components/Icon';
import { PanelShell } from '@ui/components/PanelShell';
import { StatusChip } from '@ui/components/StatusChip';
import { TabStrip } from '@ui/components/TabStrip';
import { postToHost } from '../shared/vscode';

const DEFAULT_LABELS: TabWorkspaceLabels = {
  tablistAria: 'Copilot Plus workspace tabs',
  tabAria: '{0} panel',
  tabTask: 'Task',
  tabArchitecture: 'Architecture',
  tabRequirement: 'Requirement',
  tabCommit: 'Commit',
  tabDeploy: 'Deploy',
  newBuild: 'New Build',
  startBuild: 'Start Build',
  stop: 'Stop',
  rollback: 'Rollback',
  noTasks: 'No tasks yet.',
  composerTitle: 'Composer (multi-file)',
  composerGoalPlaceholder: 'Describe coordinated edits…',
  attachFiles: 'Attach files',
  attachOpen: 'Attach open editors',
  runComposer: 'Run Composer',
  cancelComposer: 'Cancel',
  noFilesAttached: 'No files attached',
  composerTranscript: 'Composer transcript…',
  removeAttachment: 'Remove attachment',
  architectureDocs: 'Architecture documents',
  requirementDocs: 'Requirement documents',
  noDocTree: 'No documents yet.',
  commitPlaceholder: 'Commit history placeholder.',
  generateManifest: 'Generate Manifest',
  applyManifest: 'Apply Manifest',
  manualCommands: 'Manual commands:',
  ready: 'Ready.',
  noDeployRuns: 'No deploy runs yet.',
};

const EMPTY_SYNC: TabWorkspaceStateSync = {
  type: 'stateSync',
  activeTab: 'requirement',
  labels: DEFAULT_LABELS,
  task: {
    buildId: '(none)',
    status: 'Idle',
    lastMessage: '',
    runningTaskIds: [],
    tasks: [],
    composer: { goal: '', attachedFiles: [], status: 'idle', messages: [] },
  },
  architecture: { heading: 'Architecture', docCount: 0, tree: [], emptyText: 'No docs' },
  requirement: { heading: 'Requirement', docCount: 0, tree: [], emptyText: 'No docs' },
  commitPlaceholder: DEFAULT_LABELS.commitPlaceholder,
  deploy: {
    target: 'Local',
    mode: 'Manual',
    status: DEFAULT_LABELS.ready,
    commands: [],
    logTail: '',
    runs: [],
    showApply: false,
  },
};

function tabLabel(labels: TabWorkspaceLabels, id: TabId): string {
  switch (id) {
    case 'task':
      return labels.tabTask;
    case 'architecture':
      return labels.tabArchitecture;
    case 'requirement':
      return labels.tabRequirement;
    case 'commit':
      return labels.tabCommit;
    case 'deploy':
      return labels.tabDeploy;
  }
}

function ReviewBadge({ badge }: { badge?: 'green' | 'yellow' | 'red' }): JSX.Element | null {
  if (!badge) {
    return null;
  }
  return <span className={`review-${badge}`}> ●</span>;
}

function DocTree({ nodes, depth = 0 }: { nodes: DocTreeNodeWire[]; depth?: number }): JSX.Element {
  return (
    <>
      {nodes.map((node) => (
        <div key={node.path} className="doc-tree-node" style={{ marginLeft: depth * 12 }}>
          <VSCodeButton appearance="secondary" aria-label={node.title} onClick={() => postToHost({ type: 'openDoc', path: node.path })}>
            <Icon name="file" />
            {node.title}
          </VSCodeButton>
          <ReviewBadge badge={node.reviewBadge} />
          <span className="cp-meta"> ({node.level})</span>
          <DocTree nodes={node.children} depth={depth + 1} />
        </div>
      ))}
    </>
  );
}

function DocPanel({ panel }: { panel: TabWorkspaceStateSync['architecture'] }): JSX.Element {
  if (panel.docCount === 0) {
    return <p className="cp-meta">{panel.emptyText}</p>;
  }
  return (
    <>
      <p className="cp-meta">
        {panel.heading} ({panel.docCount} docs)
      </p>
      <DocTree nodes={panel.tree} />
    </>
  );
}

function TaskPanel({ state }: { state: TabWorkspaceStateSync }): JSX.Element {
  const { labels, task } = state;
  const [goal, setGoal] = useState(task.composer.goal);

  useEffect(() => {
    setGoal(task.composer.goal);
  }, [task.composer.goal]);

  return (
    <>
      <div className="cp-status-row">
        <StatusChip label="Build" value={task.buildId} />
        <StatusChip label="Status" value={task.status} />
      </div>
      {task.lastMessage ? <p className="cp-meta">{task.lastMessage}</p> : null}
      {task.runningTaskIds.length > 0 ? (
        <p className="cp-meta">Running: {task.runningTaskIds.join(', ')}</p>
      ) : null}

      <ActionBar>
        <VSCodeButton aria-label={labels.newBuild} onClick={() => postToHost({ type: 'buildAction', action: 'create' })}>
          <Icon name="add" />
          {labels.newBuild}
        </VSCodeButton>
        <VSCodeButton aria-label={labels.startBuild} onClick={() => postToHost({ type: 'buildAction', action: 'start' })}>
          <Icon name="play" />
          {labels.startBuild}
        </VSCodeButton>
        <VSCodeButton appearance="secondary" aria-label={labels.stop} onClick={() => postToHost({ type: 'buildAction', action: 'stop' })}>
          {labels.stop}
        </VSCodeButton>
      </ActionBar>

      <div className="cp-composer-box">
        <h4>{labels.composerTitle}</h4>
        <p className="cp-meta">Status: {task.composer.status}</p>
        {task.composer.lastError ? <p className="composer-error">{task.composer.lastError}</p> : null}
        <VSCodeTextArea
          className="composer-goal"
          rows={3}
          aria-label={labels.composerTitle}
          placeholder={labels.composerGoalPlaceholder}
          value={goal}
          onInput={(event) => {
            const value = (event.target as HTMLTextAreaElement).value;
            setGoal(value);
            postToHost({ type: 'composerAction', action: 'setGoal', goal: value });
          }}
        />
        <ActionBar>
          <VSCodeButton appearance="secondary" aria-label={labels.attachFiles} onClick={() => postToHost({ type: 'composerAction', action: 'pickFiles' })}>
            {labels.attachFiles}
          </VSCodeButton>
          <VSCodeButton appearance="secondary" aria-label={labels.attachOpen} onClick={() => postToHost({ type: 'composerAction', action: 'attachOpen' })}>
            {labels.attachOpen}
          </VSCodeButton>
          <VSCodeButton aria-label={labels.runComposer} onClick={() => postToHost({ type: 'composerAction', action: 'submit' })}>
            {labels.runComposer}
          </VSCodeButton>
          {task.composer.status === 'generating' ? (
            <VSCodeButton appearance="secondary" aria-label={labels.cancelComposer} onClick={() => postToHost({ type: 'composerAction', action: 'cancel' })}>
              {labels.cancelComposer}
            </VSCodeButton>
          ) : null}
        </ActionBar>
        <ul style={{ fontSize: 12, paddingLeft: 18, margin: '8px 0' }}>
          {task.composer.attachedFiles.length === 0 ? (
            <li className="cp-meta">{labels.noFilesAttached}</li>
          ) : (
            task.composer.attachedFiles.map((file) => (
              <li key={file}>
                {file}{' '}
                <VSCodeButton
                  appearance="icon"
                  aria-label={labels.removeAttachment}
                  onClick={() =>
                    postToHost({
                      type: 'composerAction',
                      action: 'setFiles',
                      files: task.composer.attachedFiles.filter((f) => f !== file),
                    })
                  }
                >
                  <Icon name="close" />
                </VSCodeButton>
              </li>
            ))
          )}
        </ul>
        <pre className="cp-log">{task.composer.messages.join('\n') || labels.composerTranscript}</pre>
      </div>

      {task.tasks.length > 0 ? (
        <table className="cp-table">
          <thead>
            <tr>
              <th>Id</th>
              <th>Title</th>
              <th>Agent</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {task.tasks.map((row) => (
              <tr key={row.id}>
                <td>{row.id}</td>
                <td>{row.title}</td>
                <td>{row.agent}</td>
                <td>{row.status}</td>
                <td>
                  {row.canRollback ? (
                    <VSCodeButton
                      appearance="secondary"
                      aria-label={`${labels.rollback} ${row.id}`}
                      onClick={() => postToHost({ type: 'buildAction', action: 'rollback', taskId: row.id })}
                    >
                      {labels.rollback}
                    </VSCodeButton>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="cp-meta">{labels.noTasks}</p>
      )}
    </>
  );
}

function DeployPanel({ state }: { state: TabWorkspaceStateSync }): JSX.Element {
  const { labels, deploy } = state;
  return (
    <>
      <div className="cp-status-row">
        <StatusChip label="Target" value={deploy.target} />
        <StatusChip label="Mode" value={deploy.mode} />
      </div>
      <p className="cp-meta">{deploy.status}</p>
      <ActionBar>
        <VSCodeButton aria-label={labels.generateManifest} onClick={() => postToHost({ type: 'buildAction', action: 'deployGenerate' })}>
          {labels.generateManifest}
        </VSCodeButton>
        {deploy.showApply ? (
          <VSCodeButton aria-label={labels.applyManifest} onClick={() => postToHost({ type: 'buildAction', action: 'deployApply' })}>
            {labels.applyManifest}
          </VSCodeButton>
        ) : null}
      </ActionBar>
      <p className="cp-meta">{labels.manualCommands}</p>
      <ul>
        {deploy.commands.map((command) => (
          <li key={command}>
            <code>{command}</code>
          </li>
        ))}
      </ul>
      {deploy.logTail ? <pre className="cp-log">{deploy.logTail}</pre> : null}
      {deploy.runs.length > 0 ? (
        <table className="cp-table">
          <thead>
            <tr>
              <th>Run</th>
              <th>Target</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {deploy.runs.map((run) => (
              <tr key={run.id}>
                <td>{run.id}</td>
                <td>{run.target}</td>
                <td>{run.status}</td>
                <td>
                  {run.canRollback ? (
                    <VSCodeButton
                      appearance="secondary"
                      aria-label={`${labels.rollback} ${run.id}`}
                      onClick={() => postToHost({ type: 'buildAction', action: 'deployRollback', taskId: run.id })}
                    >
                      {labels.rollback}
                    </VSCodeButton>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="cp-meta">{labels.noDeployRuns}</p>
      )}
    </>
  );
}

function PanelBody({ state }: { state: TabWorkspaceStateSync }): JSX.Element {
  switch (state.activeTab) {
    case 'task':
      return <TaskPanel state={state} />;
    case 'architecture':
      return <DocPanel panel={state.architecture} />;
    case 'requirement':
      return <DocPanel panel={state.requirement} />;
    case 'commit':
      return <p className="cp-meta">{state.commitPlaceholder}</p>;
    case 'deploy':
      return <DeployPanel state={state} />;
  }
}

export function App(): JSX.Element {
  const [state, setState] = useState<TabWorkspaceStateSync>(EMPTY_SYNC);

  useEffect(() => {
    postToHost({ type: 'ready' });
    const onMessage = (event: MessageEvent<TabWorkspaceHostMessage>) => {
      if (event.data?.type === 'stateSync') {
        setState(event.data);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const labels = state.labels;
  const tabItems = TAB_IDS.map((id) => ({ id, label: tabLabel(labels, id) }));

  return (
    <div className="cp-root">
      <TabStrip
        items={tabItems}
        activeId={state.activeTab}
        ariaLabel={labels.tablistAria}
        tabAriaTemplate={labels.tabAria}
        numbered
        onSelect={(tab) => postToHost({ type: 'selectTab', tab })}
      />
      <PanelShell title={`${tabLabel(labels, state.activeTab)} Panel`} className="tab-panel-body">
        <PanelBody state={state} />
      </PanelShell>
    </div>
  );
}
