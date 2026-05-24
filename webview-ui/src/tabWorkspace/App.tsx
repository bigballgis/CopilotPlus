import { useEffect, useState } from 'react';
import type {
  DocTreeNodeWire,
  TabId,
  TabWorkspaceHostMessage,
  TabWorkspaceLabels,
  TabWorkspaceStateSync,
} from '@shared/tabWorkspaceWebviewProtocol';
import { TAB_IDS } from '@shared/tabWorkspaceWebviewProtocol';
import { postToHost } from '../shared/vscode';
import './tabWorkspace.css';

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
          <button type="button" aria-label={node.title} onClick={() => postToHost({ type: 'openDoc', path: node.path })}>
            {node.title}
          </button>
          <ReviewBadge badge={node.reviewBadge} />
          <span className="doc-tree-level"> ({node.level})</span>
          <DocTree nodes={node.children} depth={depth + 1} />
        </div>
      ))}
    </>
  );
}

function DocPanel({ panel }: { panel: TabWorkspaceStateSync['architecture'] }): JSX.Element {
  if (panel.docCount === 0) {
    return <p>{panel.emptyText}</p>;
  }
  return (
    <>
      <p>
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
      <p>
        <strong>Build</strong> {task.buildId} · <strong>Status</strong> {task.status}
      </p>
      {task.lastMessage ? <p className="tab-meta">{task.lastMessage}</p> : null}
      {task.runningTaskIds.length > 0 ? <p>Running: {task.runningTaskIds.join(', ')}</p> : null}
      <div className="tab-actions">
        <button type="button" aria-label={labels.newBuild} onClick={() => postToHost({ type: 'buildAction', action: 'create' })}>
          {labels.newBuild}
        </button>
        <button type="button" aria-label={labels.startBuild} onClick={() => postToHost({ type: 'buildAction', action: 'start' })}>
          {labels.startBuild}
        </button>
        <button type="button" aria-label={labels.stop} onClick={() => postToHost({ type: 'buildAction', action: 'stop' })}>
          {labels.stop}
        </button>
      </div>

      <div className="composer-box">
        <h4>{labels.composerTitle}</h4>
        <p className="tab-meta">Status: {task.composer.status}</p>
        {task.composer.lastError ? <p className="composer-error">{task.composer.lastError}</p> : null}
        <textarea
          className="composer-goal"
          rows={3}
          aria-label={labels.composerTitle}
          placeholder={labels.composerGoalPlaceholder}
          value={goal}
          onChange={(event) => {
            setGoal(event.target.value);
            postToHost({ type: 'composerAction', action: 'setGoal', goal: event.target.value });
          }}
        />
        <div className="tab-actions">
          <button type="button" aria-label={labels.attachFiles} onClick={() => postToHost({ type: 'composerAction', action: 'pickFiles' })}>
            {labels.attachFiles}
          </button>
          <button type="button" aria-label={labels.attachOpen} onClick={() => postToHost({ type: 'composerAction', action: 'attachOpen' })}>
            {labels.attachOpen}
          </button>
          <button type="button" aria-label={labels.runComposer} onClick={() => postToHost({ type: 'composerAction', action: 'submit' })}>
            {labels.runComposer}
          </button>
          {task.composer.status === 'generating' ? (
            <button type="button" aria-label={labels.cancelComposer} onClick={() => postToHost({ type: 'composerAction', action: 'cancel' })}>
              {labels.cancelComposer}
            </button>
          ) : null}
        </div>
        <ul style={{ fontSize: 12, paddingLeft: 18 }}>
          {task.composer.attachedFiles.length === 0 ? (
            <li style={{ opacity: 0.7 }}>{labels.noFilesAttached}</li>
          ) : (
            task.composer.attachedFiles.map((file) => (
              <li key={file}>
                {file}{' '}
                <button
                  type="button"
                  aria-label={labels.removeAttachment}
                  onClick={() =>
                    postToHost({
                      type: 'composerAction',
                      action: 'setFiles',
                      files: task.composer.attachedFiles.filter((f) => f !== file),
                    })
                  }
                >
                  ×
                </button>
              </li>
            ))
          )}
        </ul>
        <pre className="tab-log" style={{ maxHeight: 100 }}>
          {task.composer.messages.join('\n') || labels.composerTranscript}
        </pre>
      </div>

      {task.tasks.length > 0 ? (
        <table className="tab-table">
          <thead>
            <tr>
              <th align="left">Id</th>
              <th align="left">Title</th>
              <th align="left">Agent</th>
              <th align="left">Status</th>
              <th align="left">Actions</th>
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
                    <button
                      type="button"
                      aria-label={`${labels.rollback} ${row.id}`}
                      onClick={() => postToHost({ type: 'buildAction', action: 'rollback', taskId: row.id })}
                    >
                      {labels.rollback}
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p>{labels.noTasks}</p>
      )}
    </>
  );
}

function DeployPanel({ state }: { state: TabWorkspaceStateSync }): JSX.Element {
  const { labels, deploy } = state;
  return (
    <>
      <p>
        <strong>Target</strong> {deploy.target} · <strong>Mode</strong> {deploy.mode}
      </p>
      <p className="tab-meta">{deploy.status}</p>
      <div className="tab-actions">
        <button type="button" aria-label={labels.generateManifest} onClick={() => postToHost({ type: 'buildAction', action: 'deployGenerate' })}>
          {labels.generateManifest}
        </button>
        {deploy.showApply ? (
          <button type="button" aria-label={labels.applyManifest} onClick={() => postToHost({ type: 'buildAction', action: 'deployApply' })}>
            {labels.applyManifest}
          </button>
        ) : null}
      </div>
      <p className="tab-meta">{labels.manualCommands}</p>
      <ul>
        {deploy.commands.map((command) => (
          <li key={command}>
            <code>{command}</code>
          </li>
        ))}
      </ul>
      {deploy.logTail ? <pre className="tab-log">{deploy.logTail}</pre> : null}
      {deploy.runs.length > 0 ? (
        <table className="tab-table">
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
                    <button
                      type="button"
                      aria-label={`${labels.rollback} ${run.id}`}
                      onClick={() => postToHost({ type: 'buildAction', action: 'deployRollback', taskId: run.id })}
                    >
                      {labels.rollback}
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p>{labels.noDeployRuns}</p>
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
      return <p>{state.commitPlaceholder}</p>;
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

  return (
    <div className="tab-root">
      <div role="tablist" aria-label={labels.tablistAria} className="tab-list">
        {TAB_IDS.map((id, index) => {
          const label = tabLabel(labels, id);
          return (
            <button
              key={id}
              role="tab"
              type="button"
              id={`tab-${id}`}
              className="tab-button"
              aria-selected={id === state.activeTab}
              aria-label={labels.tabAria.replace('{0}', label)}
              onClick={() => postToHost({ type: 'selectTab', tab: id })}
            >
              {index + 1}. {label}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" aria-labelledby={`tab-${state.activeTab}`} className="tab-panel">
        <h3>{tabLabel(labels, state.activeTab)} Panel</h3>
        <PanelBody state={state} />
      </div>
    </div>
  );
}
