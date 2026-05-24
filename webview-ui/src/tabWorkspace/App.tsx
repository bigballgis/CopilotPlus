import { useEffect, useState } from 'react';
import { VSCodeButton, VSCodeDropdown, VSCodeOption, VSCodeTextArea } from '@vscode/webview-ui-toolkit/react';
import type {
  DocBreadcrumbWire,
  DocNavLinkWire,
  TabId,
  TabWorkspaceHostMessage,
  TabWorkspaceLabels,
  TabWorkspaceStateSync,
} from '@shared/tabWorkspaceWebviewProtocol';
import { TAB_IDS } from '@shared/tabWorkspaceWebviewProtocol';
import { ActionBar } from '@ui/components/ActionBar';
import { ArchitectureDiagram } from '@ui/components/ArchitectureDiagram';
import { DocTreePicker } from '@ui/components/DocTreePicker';
import { Icon } from '@ui/components/Icon';
import { PanelShell } from '@ui/components/PanelShell';
import { RequirementPreviewPanel } from '@ui/components/RequirementPreviewPanel';
import { StatusChip } from '@ui/components/StatusChip';
import { TabStrip } from '@ui/components/TabStrip';
import { TaskDagView } from '@ui/components/TaskDagView';
import { formatElapsedMs } from '../shared/formatElapsed';
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
  stopAll: 'Stop All',
  buildLimits: 'Tool calls: {0}/{1} · Elapsed: {2}s / {3}s',
  workPath: 'Work path',
  fallbackNotice: 'Isolation fallback',
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
  commitFilter: 'Filter commits…',
  commitNoEntries: 'No Copilot Plus commits recorded yet.',
  commitDiffEmpty: 'Select a commit to preview its diff.',
  commitRolledBackBadge: 'Rolled back',
  commitConfirmRollback: 'Restore checkpoint for commit {0}?',
  commitFilesChanged: '{0} files',
  generateManifest: 'Generate Manifest',
  applyManifest: 'Apply Manifest',
  manualCommands: 'Manual commands:',
  ready: 'Ready.',
  noDeployRuns: 'No deploy runs yet.',
  taskDagTitle: 'Task DAG',
  taskListTitle: 'Tasks',
  architectureDiagram: 'Architecture diagram',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  fitView: 'Fit view',
  requirementTree: 'Document tree',
  requirementPreview: 'Preview',
  editDoc: 'Edit',
  selectDocHint: 'Select a document to preview.',
  docBreadcrumb: 'Document hierarchy',
  childDocsHeading: 'Immediate children',
  lateralLinksHeading: 'Lateral links',
  lateralEdge: 'Lateral link',
  hierarchicalEdge: 'Hierarchy',
  columnId: 'Id',
  columnTitle: 'Title',
  columnAgent: 'Agent',
  columnStatus: 'Status',
  columnActions: 'Actions',
  columnElapsed: 'Elapsed',
  pause: 'Pause',
  resume: 'Resume',
  skip: 'Skip',
  retry: 'Retry',
  viewLogs: 'View logs',
  taskLogTitle: 'Task transcript',
  closeLog: 'Close log',
  noTaskLog: 'No transcript recorded for this task yet.',
  openDoc: 'Open',
  selectModel: 'Model',
  selectModelAria: 'Select Copilot model',
  noModelsAvailable: 'No Copilot models are available.',
  activeCodeLayer: 'Active file layer path',
  activeCodeLayerOrphan: 'Orphan code — no Component doc',
  staleBadge: 'Stale',
  compactSubtree: 'Compact',
  compactSubtreeAria: 'Compact stale documents under {0}',
};

const EMPTY_SYNC: TabWorkspaceStateSync = {
  type: 'stateSync',
  activeTab: 'requirement',
  labels: DEFAULT_LABELS,
  models: [],
  selectedModelId: '',
  modelsAvailable: false,
  modelUnavailableNotice: DEFAULT_LABELS.noModelsAvailable,
  task: {
    buildId: '(none)',
    status: 'Idle',
    lastMessage: '',
    runningTaskIds: [],
    tasks: [],
    edges: [],
    composer: { goal: '', attachedFiles: [], status: 'idle', messages: [] },
  },
  architecture: { heading: 'Architecture', docCount: 0, tree: [], diagramEdges: [], emptyText: 'No docs' },
  requirement: { heading: 'Requirement', docCount: 0, tree: [], diagramEdges: [], emptyText: 'No docs' },
  commit: { commits: [], emptyText: DEFAULT_LABELS.commitNoEntries },
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

function TaskPanel({
  state,
  taskLog,
  onCloseLog,
}: {
  state: TabWorkspaceStateSync;
  taskLog?: { taskId: string; content: string };
  onCloseLog: () => void;
}): JSX.Element {
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
        <StatusChip label={labels.workPath} value={task.workPath ?? 'inline'} />
      </div>
      {task.fallbackNotice ? (
        <p className="cp-meta">
          {labels.fallbackNotice}: {task.fallbackNotice}
        </p>
      ) : null}
      {task.lastMessage ? <p className="cp-meta">{task.lastMessage}</p> : null}
      {task.runningTaskIds.length > 0 ? (
        <p className="cp-meta">Running: {task.runningTaskIds.join(', ')}</p>
      ) : null}

      {task.limits ? (
        <p className="cp-meta">
          {labels.buildLimits
            .replace('{0}', String(task.limits.toolCallCount))
            .replace('{1}', String(task.limits.maxToolCalls))
            .replace('{2}', String(task.limits.elapsedSec))
            .replace('{3}', String(task.limits.maxDurationSec))}
        </p>
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
        <VSCodeButton
          appearance="secondary"
          aria-label={labels.stopAll}
          onClick={() => postToHost({ type: 'buildAction', action: 'stopAll' })}
        >
          {labels.stopAll}
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

      {task.validationErrors.length > 0 ? (
        <ul className="cp-validation-list">
          {task.validationErrors.map((error, index) => (
            <li key={`${error.taskId ?? 'dag'}-${index}`} className="cp-meta">
              {error.taskId ? `${error.taskId}: ` : ''}
              {error.message}
            </li>
          ))}
        </ul>
      ) : null}

      {taskLog ? (
        <div className="cp-task-log">
          <div className="cp-task-log-header">
            <h4 className="cp-viz-title">
              {labels.taskLogTitle} — {taskLog.taskId}
            </h4>
            <VSCodeButton appearance="secondary" aria-label={labels.closeLog} onClick={onCloseLog}>
              {labels.closeLog}
            </VSCodeButton>
          </div>
          <pre className="cp-log cp-task-log-body">
            {taskLog.content.trim() || labels.noTaskLog}
          </pre>
        </div>
      ) : null}

      <TaskDagView
        title={labels.taskDagTitle}
        tasks={task.tasks}
        edges={task.edges}
        runningTaskIds={task.runningTaskIds}
      />

      {task.tasks.length > 0 ? (
        <>
          <h4 className="cp-viz-title">{labels.taskListTitle}</h4>
          <table className="cp-table">
            <thead>
              <tr>
                <th>{labels.columnId}</th>
                <th>{labels.columnTitle}</th>
                <th>{labels.columnAgent}</th>
                <th>{labels.columnStatus}</th>
                <th>{labels.columnElapsed}</th>
                <th>{labels.columnActions}</th>
              </tr>
            </thead>
            <tbody>
              {task.tasks.map((row) => (
                <tr key={row.id}>
                  <td>{row.id}</td>
                  <td>{row.title}</td>
                  <td>{row.agent}</td>
                  <td>{row.status}</td>
                  <td>{formatElapsedMs(row.elapsedMs)}</td>
                  <td>
                    <ActionBar className="cp-task-actions">
                      {row.canPause ? (
                        <VSCodeButton
                          appearance="secondary"
                          aria-label={`${labels.pause} ${row.id}`}
                          onClick={() => postToHost({ type: 'buildAction', action: 'pause', taskId: row.id })}
                        >
                          {labels.pause}
                        </VSCodeButton>
                      ) : null}
                      {row.canResume ? (
                        <VSCodeButton
                          aria-label={`${labels.resume} ${row.id}`}
                          onClick={() => postToHost({ type: 'buildAction', action: 'resume', taskId: row.id })}
                        >
                          {labels.resume}
                        </VSCodeButton>
                      ) : null}
                      {row.canSkip ? (
                        <VSCodeButton
                          appearance="secondary"
                          aria-label={`${labels.skip} ${row.id}`}
                          onClick={() => postToHost({ type: 'buildAction', action: 'skip', taskId: row.id })}
                        >
                          {labels.skip}
                        </VSCodeButton>
                      ) : null}
                      {row.canRetry ? (
                        <VSCodeButton
                          aria-label={`${labels.retry} ${row.id}`}
                          onClick={() => postToHost({ type: 'buildAction', action: 'retry', taskId: row.id })}
                        >
                          {labels.retry}
                        </VSCodeButton>
                      ) : null}
                      {row.hasLogs ? (
                        <VSCodeButton
                          appearance="secondary"
                          aria-label={`${labels.viewLogs} ${row.id}`}
                          onClick={() => postToHost({ type: 'buildAction', action: 'viewLogs', taskId: row.id })}
                        >
                          {labels.viewLogs}
                        </VSCodeButton>
                      ) : null}
                      {row.canRollback ? (
                        <VSCodeButton
                          appearance="secondary"
                          aria-label={`${labels.rollback} ${row.id}`}
                          onClick={() => postToHost({ type: 'buildAction', action: 'rollback', taskId: row.id })}
                        >
                          {labels.rollback}
                        </VSCodeButton>
                      ) : null}
                    </ActionBar>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <p className="cp-meta">{labels.noTasks}</p>
      )}
    </>
  );
}

function CommitPanel({
  state,
  selectedHash,
  diffPreview,
  onSelect,
}: {
  state: TabWorkspaceStateSync;
  selectedHash?: string;
  diffPreview: string;
  onSelect: (hash: string) => void;
}): JSX.Element {
  const { labels, commit } = state;
  const [filter, setFilter] = useState('');

  const query = filter.trim().toLowerCase();
  const rows = commit.commits.filter((entry) => {
    if (!query) {
      return true;
    }
    return (
      entry.message.toLowerCase().includes(query) ||
      entry.stage.toLowerCase().includes(query) ||
      entry.taskId?.toLowerCase().includes(query) ||
      entry.hash.startsWith(query)
    );
  });

  return (
    <>
      <input
        aria-label={labels.commitFilter}
        className="cp-filter"
        placeholder={labels.commitFilter}
        type="search"
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
      />
      {rows.length > 0 ? (
        <table className="cp-table">
          <thead>
            <tr>
              <th>Hash</th>
              <th>Stage</th>
              <th>Task</th>
              <th>Message</th>
              <th>Files</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((entry) => (
              <tr
                key={entry.hash}
                className={selectedHash === entry.hash ? 'cp-row-selected' : undefined}
                onClick={() => onSelect(entry.hash)}
              >
                <td>
                  <code>{entry.hash.slice(0, 7)}</code>
                  {entry.rolledBackAt ? (
                    <span className="cp-badge">{labels.commitRolledBackBadge}</span>
                  ) : null}
                </td>
                <td>{entry.stage}</td>
                <td>{entry.taskId ?? '—'}</td>
                <td>{entry.message}</td>
                <td>{labels.commitFilesChanged.replace('{0}', String(entry.filesChanged))}</td>
                <td>
                  {entry.canRollback ? (
                    <VSCodeButton
                      appearance="secondary"
                      aria-label={`${labels.rollback} ${entry.hash.slice(0, 7)}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        postToHost({ type: 'commitAction', action: 'rollback', hash: entry.hash });
                      }}
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
        <p className="cp-meta">{commit.emptyText}</p>
      )}
      <pre className="cp-log">{diffPreview || labels.commitDiffEmpty}</pre>
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

function PanelBody({
  state,
  selectedDocPath,
  docPreview,
  onSelectDoc,
  taskLog,
  onCloseTaskLog,
  selectedCommitHash,
  commitDiff,
  onSelectCommit,
}: {
  state: TabWorkspaceStateSync;
  selectedDocPath?: string;
  docPreview?: {
    path: string;
    title: string;
    markdown: string;
    breadcrumb?: DocBreadcrumbWire[];
    children?: DocNavLinkWire[];
    lateralByType?: Record<string, DocNavLinkWire[]>;
  };
  onSelectDoc: (path: string) => void;
  taskLog?: { taskId: string; content: string };
  onCloseTaskLog: () => void;
  selectedCommitHash?: string;
  commitDiff: string;
  onSelectCommit: (hash: string) => void;
}): JSX.Element {
  switch (state.activeTab) {
    case 'task':
      return <TaskPanel state={state} taskLog={taskLog} onCloseLog={onCloseTaskLog} />;
    case 'architecture':
      return state.architecture.docCount === 0 ? (
        <p className="cp-meta">{state.architecture.emptyText}</p>
      ) : (
        <>
          {state.architecture.activeCodeLayer ? (
            <p className="cp-meta">
              {state.architecture.activeCodeLayer.orphan
                ? `${state.labels.activeCodeLayerOrphan}: ${state.architecture.activeCodeLayer.file}`
                : `${state.labels.activeCodeLayer}: ${state.architecture.activeCodeLayer.segments}${
                    state.architecture.activeCodeLayer.coOwnerTitles?.length
                      ? ` (+${state.architecture.activeCodeLayer.coOwnerTitles.length} co-owner)`
                      : ''
                  }`}
            </p>
          ) : null}
          <p className="cp-meta">
            {state.architecture.heading} ({state.architecture.docCount} docs)
          </p>
          <ArchitectureDiagram
            labels={state.labels}
            tree={state.architecture.tree}
            edges={state.architecture.diagramEdges}
          />
          <div className="cp-arch-tree">
            <h4 className="cp-viz-title">{state.labels.architectureDocs}</h4>
            <DocTreePicker
              nodes={state.architecture.tree}
              ariaLabel={state.labels.architectureDocs}
              labels={state.labels}
              onSelect={(path) => postToHost({ type: 'openDoc', path })}
              onCompactSubtree={(path) => postToHost({ type: 'compactDocSubtree', path })}
            />
          </div>
        </>
      );
    case 'requirement':
      return (
        <RequirementPreviewPanel
          labels={state.labels}
          panel={state.requirement}
          selectedPath={selectedDocPath}
          previewTitle={docPreview?.title}
          previewMarkdown={docPreview?.markdown}
          breadcrumb={docPreview?.breadcrumb}
          children={docPreview?.children}
          lateralByType={docPreview?.lateralByType}
          onSelectDoc={onSelectDoc}
        />
      );
    case 'commit':
      return (
        <CommitPanel
          state={state}
          selectedHash={selectedCommitHash}
          diffPreview={commitDiff}
          onSelect={onSelectCommit}
        />
      );
    case 'deploy':
      return <DeployPanel state={state} />;
  }
}

export function App(): JSX.Element {
  const [state, setState] = useState<TabWorkspaceStateSync>(EMPTY_SYNC);
  const [selectedDocPath, setSelectedDocPath] = useState<string | undefined>();
  const [docPreview, setDocPreview] = useState<
    | {
        path: string;
        title: string;
        markdown: string;
        breadcrumb?: DocBreadcrumbWire[];
        children?: DocNavLinkWire[];
        lateralByType?: Record<string, DocNavLinkWire[]>;
      }
    | undefined
  >();
  const [taskLog, setTaskLog] = useState<{ taskId: string; content: string } | undefined>();
  const [selectedCommitHash, setSelectedCommitHash] = useState<string | undefined>();
  const [commitDiff, setCommitDiff] = useState('');

  const handleSelectDoc = (path: string) => {
    setSelectedDocPath(path);
    postToHost({ type: 'selectDoc', path });
  };

  useEffect(() => {
    postToHost({ type: 'ready' });
    const onMessage = (event: MessageEvent<TabWorkspaceHostMessage>) => {
      if (event.data?.type === 'stateSync') {
        setState(event.data);
        return;
      }
      if (event.data?.type === 'docPreview') {
        setSelectedDocPath(event.data.path);
        setDocPreview({
          path: event.data.path,
          title: event.data.title,
          markdown: event.data.markdown,
          breadcrumb: event.data.breadcrumb,
          children: event.data.children,
          lateralByType: event.data.lateralByType,
        });
        return;
      }
      if (event.data?.type === 'taskLog') {
        setTaskLog({ taskId: event.data.taskId, content: event.data.content });
        return;
      }
      if (event.data?.type === 'commitDiff') {
        setSelectedCommitHash(event.data.hash);
        setCommitDiff(event.data.diff);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const labels = state.labels;
  const tabItems = TAB_IDS.map((id) => ({ id, label: tabLabel(labels, id) }));

  return (
    <div className="cp-root">
      <div className="cp-header">
        <span className="cp-header-title">Tab Workspace</span>
        <div className="cp-status-row">
          <label className="cp-console-row">
            {labels.selectModel}
            <VSCodeDropdown
              aria-label={labels.selectModelAria}
              value={state.selectedModelId}
              disabled={!state.modelsAvailable}
              onChange={(e) => {
                const target = e.target as HTMLSelectElement;
                if (target.value) {
                  postToHost({ type: 'selectModel', modelId: target.value });
                }
              }}
            >
              {state.models.map((option) => (
                <VSCodeOption key={option.id} value={option.id}>
                  {option.name}
                </VSCodeOption>
              ))}
            </VSCodeDropdown>
          </label>
        </div>
        {state.modelUnavailableNotice ? (
          <span className="cp-status-note">{state.modelUnavailableNotice}</span>
        ) : null}
      </div>
      <TabStrip
        items={tabItems}
        activeId={state.activeTab}
        ariaLabel={labels.tablistAria}
        tabAriaTemplate={labels.tabAria}
        numbered
        onSelect={(tab) => postToHost({ type: 'selectTab', tab })}
      />
      <PanelShell title={`${tabLabel(labels, state.activeTab)} Panel`} className="tab-panel-body">
        <PanelBody
          state={state}
          selectedDocPath={selectedDocPath}
          docPreview={docPreview}
          onSelectDoc={handleSelectDoc}
          taskLog={taskLog}
          onCloseTaskLog={() => setTaskLog(undefined)}
          selectedCommitHash={selectedCommitHash}
          commitDiff={commitDiff}
          onSelectCommit={(hash) => {
            setSelectedCommitHash(hash);
            setCommitDiff('');
            postToHost({ type: 'commitAction', action: 'select', hash });
          }}
        />
      </PanelShell>
    </div>
  );
}
