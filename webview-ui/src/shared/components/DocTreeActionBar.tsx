import { VSCodeButton } from '@vscode/webview-ui-toolkit/react';
import type { DocTreePanelAction, TabWorkspaceLabels } from '@shared/tabWorkspaceWebviewProtocol';
import { ActionBar } from './ActionBar';

interface DocTreeActionBarProps {
  labels: Pick<
    TabWorkspaceLabels,
    'createChildDoc' | 'deleteDoc' | 'linkDoc' | 'unlinkDoc' | 'markReviewedDoc' | 'editDoc' | 'openDoc'
  >;
  selectedPath: string;
  hasChildren?: boolean;
  canCreateChild?: boolean;
  onAction: (action: DocTreePanelAction) => void;
  onEdit: () => void;
  onOpen: () => void;
}

export function DocTreeActionBar({
  labels,
  selectedPath,
  hasChildren,
  canCreateChild,
  onAction,
  onEdit,
  onOpen,
}: DocTreeActionBarProps): JSX.Element {
  return (
    <ActionBar>
      {canCreateChild ? (
        <VSCodeButton appearance="secondary" aria-label={labels.createChildDoc} onClick={() => onAction('createChild')}>
          {labels.createChildDoc}
        </VSCodeButton>
      ) : null}
      {!hasChildren ? (
        <VSCodeButton appearance="secondary" aria-label={labels.deleteDoc} onClick={() => onAction('delete')}>
          {labels.deleteDoc}
        </VSCodeButton>
      ) : null}
      <VSCodeButton appearance="secondary" aria-label={labels.linkDoc} onClick={() => onAction('link')}>
        {labels.linkDoc}
      </VSCodeButton>
      <VSCodeButton appearance="secondary" aria-label={labels.unlinkDoc} onClick={() => onAction('unlink')}>
        {labels.unlinkDoc}
      </VSCodeButton>
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
