/** Copy codicon assets into dist/webview for packaged VSIX (node_modules excluded). */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = path.join(root, 'node_modules', '@vscode', 'codicons', 'dist');
const destDir = path.join(root, 'dist', 'webview', 'codicons');

for (const file of ['codicon.css', 'codicon.ttf']) {
  fs.mkdirSync(destDir, { recursive: true });
  fs.copyFileSync(path.join(srcDir, file), path.join(destDir, file));
}

console.log('[copy-webview-assets] codicons → dist/webview/codicons');
