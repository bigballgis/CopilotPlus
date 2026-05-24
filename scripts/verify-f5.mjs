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
