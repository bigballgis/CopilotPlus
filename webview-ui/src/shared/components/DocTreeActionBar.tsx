import { VSCodeButton } from '@vscode/webview-ui-toolkit/react';
import type { DocTreePanelAction, TabWorkspaceLabels } from '@shared/tabWorkspaceWebviewProtocol';
import { ActionBar } from './ActionBar';

interface DocTreeActionBarProps {
  labels: Pick<
    TabWorkspaceLabels,
    | 'createChildDoc'
    | 'deleteDoc'
    | 'deleteSubtree'
    | 'linkDoc'
    | 'unlinkDoc'
    | 'markReviewedDoc'
    | 'ensureSummaryDoc'
    | 'renameDoc'
    | 'moveDoc'
    | 'editDoc'
    | 'openDoc'
  >;
  selectedPath: string;
  hasChildren?: boolean;
  canCreateChild?: boolean;
  canMove?: boolean;
  missingSummary?: boolean;
  onAction: (action: DocTreePanelAction) => void;
  onEdit: () => void;
  onOpen: () => void;
}

export function DocTreeActionBar({
  labels,
  selectedPath,
  hasChildren,
  canCreateChild,
  canMove = true,
  missingSummary,
  onAction,
  onEdit,
  onOpen,
}: DocTreeActionBarProps): JSX.Element {
  const deleteLabel = hasChildren ? labels.deleteSubtree : labels.deleteDoc;

  return (
    <ActionBar>
      {canCreateChild ? (
        <VSCodeButton appearance="secondary" aria-label={labels.createChildDoc} onClick={() => onAction('createChild')}>
          {labels.createChildDoc}
        </VSCodeButton>
      ) : null}
      {missingSummary ? (
        <VSCodeButton
          appearance="secondary"
          aria-label={labels.ensureSummaryDoc}
          onClick={() => onAction('ensureSummary')}
        >
          {labels.ensureSummaryDoc}
        </VSCodeButton>
      ) : null}
      <VSCodeButton appearance="secondary" aria-label={deleteLabel} onClick={() => onAction('delete')}>
        {deleteLabel}
      </VSCodeButton>
      <VSCodeButton appearance="secondary" aria-label={labels.linkDoc} onClick={() => onAction('link')}>
        {labels.linkDoc}
      </VSCodeButton>
      <VSCodeButton appearance="secondary" aria-label={labels.unlinkDoc} onClick={() => onAction('unlink')}>
        {labels.unlinkDoc}
      </VSCodeButton>
      <VSCodeButton appearance="secondary" aria-label={labels.renameDoc} onClick={() => onAction('rename')}>
        {labels.renameDoc}
      </VSCodeButton>
      {canMove ? (
        <VSCodeButton appearance="secondary" aria-label={labels.moveDoc} onClick={() => onAction('move')}>
          {labels.moveDoc}
        </VSCodeButton>
      ) : null}
      <VSCodeButton appearance="secondary" aria-label={labels.markReviewedDoc} onClick={() => onAction('markReviewed')}>
        {labels.markReviewedDoc}
      </VSCodeButton>
      <VSCodeButton appearance="secondary" aria-label={labels.editDoc} onClick={onEdit}>
        {labels.editDoc}
      </VSCodeButton>
      <VSCodeButton appearance="secondary" aria-label={labels.openDoc} onClick={onOpen}>
        {labels.openDoc}
      </VSCodeButton>
    </ActionBar>
  );
}
