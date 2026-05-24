#!/usr/bin/env node
/** F5 smoke prerequisites — compiled extension + webview bundles (R-PLAT-1 / R-INT-2/3/9) */

import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const REQUIRED_FILES = [
  'dist/extension.js',
  'dist/webview/conversation.js',
  'dist/webview/conversation.css',
  'dist/webview/tabWorkspace.js',
  'dist/webview/tabWorkspace.css',
  'dist/webview/controlConsole.js',
  'dist/webview/controlConsole.css',
  'dist/webview/codicons/codicon.css',
];

const REQUIRED_EXPORTS = [
  'getConversationWebviewHtml',
  'getTabWorkspaceWebviewHtml',
  'getControlConsoleWebviewHtml',
];

const DOCS_LIFECYCLE_MARKERS = [
  { file: 'src/shared/tabWorkspaceWebviewProtocol.ts', tokens: ['stale?: boolean', "type: 'compactDocSubtree'"] },
  { file: 'src/docs/ownershipIndex.ts', tokens: ['class CodeOwnershipIndex', 'rebuild('] },
  { file: 'src/context/indexManager.ts', tokens: ['resolveOwnership(', 'refreshOwnershipIndex'] },
  { file: 'src/interaction/conversationPane.ts', tokens: ['touchLastReferenced', 'resolveScope'] },
  { file: 'src/docs/documentTreeService.ts', tokens: ['touchLastReferenced'] },
];

const COMMIT_PANEL_MARKERS = [
  { file: 'src/editing/commitHistory.ts', tokens: ['class CommitHistoryService', 'rollbackCommit'] },
  { file: 'src/shared/tabWorkspaceWebviewProtocol.ts', tokens: ['CommitPanelWire', "type: 'commitAction'"] },
  { file: 'src/interaction/tabWorkspaceSnapshot.ts', tokens: ['buildCommitPanel'] },
  { file: 'webview-ui/src/tabWorkspace/App.tsx', tokens: ['function CommitPanel'] },
];

const DECISION_CENTER_MARKERS = [
  { file: 'src/interaction/decisionPersistence.ts', tokens: ['decisions.json', 'remainingSecAtSave'] },
  { file: 'src/interaction/decisionCenter.ts', tokens: ['bulkApproveDefault', 'getPendingViews'] },
  { file: 'src/shared/controlConsoleWebviewProtocol.ts', tokens: ['DecisionItemWire', "type: 'bulkApproveDecisions'"] },
  { file: 'webview-ui/src/controlConsole/App.tsx', tokens: ['cp-decision-list', 'bulkApproveDecisions'] },
];

async function main() {
  const errors = [];

  for (const rel of REQUIRED_FILES) {
    const abs = path.join(root, rel);
    try {
      const stat = await fs.stat(abs);
      if (!stat.isFile() || stat.size === 0) {
        errors.push(`missing or empty artifact: ${rel}`);
      }
    } catch {
      errors.push(`missing artifact: ${rel}`);
    }
  }

  const bundleSource = await fs.readFile(path.join(root, 'src/interaction/webviewBundle.ts'), 'utf8');
  for (const name of REQUIRED_EXPORTS) {
    if (!bundleSource.includes(`export function ${name}`)) {
      errors.push(`webviewBundle.ts missing export: ${name}`);
    }
  }

  for (const { file, tokens } of [...DOCS_LIFECYCLE_MARKERS, ...COMMIT_PANEL_MARKERS, ...DECISION_CENTER_MARKERS]) {
    const source = await fs.readFile(path.join(root, file), 'utf8');
    for (const token of tokens) {
      if (!source.includes(token)) {
        errors.push(`${file} missing marker: ${token}`);
      }
    }
  }

  if (errors.length > 0) {
    console.error('F5 verification FAILED (run npm run compile first)');
    for (const err of errors) {
      console.error(`  - ${err}`);
    }
    return 1;
  }

  console.log('F5 verification OK (extension + webview bundles present)');
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
