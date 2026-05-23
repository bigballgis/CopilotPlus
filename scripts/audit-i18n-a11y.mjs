#!/usr/bin/env node
/** R-PLAT-9 — i18n + a11y audit (CI gate) */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = path.join(root, 'src');
const interactionDir = path.join(srcDir, 'interaction');
const bundlePath = path.join(root, 'l10n', 'bundle.l10n.json');
const l10nTsPath = path.join(srcDir, 'platform', 'l10n.ts');

const failures = [];

function readAllTsFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...readAllTsFiles(full));
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

function extractFallbackKeys(content) {
  const keys = [];
  const re = /'([^']+)':\s*'/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    keys.push(m[1]);
  }
  return keys;
}

function auditBundleParity() {
  const bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf8'));
  const l10nTs = fs.readFileSync(l10nTsPath, 'utf8');
  const fallbackKeys = extractFallbackKeys(l10nTs);
  const bundleKeys = Object.keys(bundle);

  for (const key of fallbackKeys) {
    if (!(key in bundle)) {
      failures.push(`FALLBACK key missing from bundle: ${key}`);
    }
  }
  for (const key of bundleKeys) {
    if (!fallbackKeys.includes(key)) {
      failures.push(`Bundle key missing from FALLBACK: ${key}`);
    }
  }
}

function auditHardcodedNotifications() {
  const allowPatterns = [
    /show(?:Information|Error|Warning)Message\s*\(\s*t\s*\(/,
    /show(?:Information|Error|Warning)Message\s*\(\s*err instanceof Error/,
    /show(?:Information|Error|Warning)Message\s*\(\s*e instanceof Error/,
    /show(?:Information|Error|Warning)Message\s*\(\s*errors\.map/,
    /show(?:Information|Error|Warning)Message\s*\(\s*message\s*\)/,
    /show(?:Information|Error|Warning)Message\s*\(\s*result\.reason/,
    /show(?:Information|Error|Warning)Message\s*\(\s*prepared\.blockReason/,
  ];

  const msgRe = /show(?:Information|Error|Warning)Message\s*\(\s*(`|'|")/g;

  for (const file of readAllTsFiles(srcDir)) {
    if (file.includes(`${path.sep}test${path.sep}`)) {
      continue;
    }
    const rel = path.relative(root, file).replace(/\\/g, '/');
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!msgRe.test(line)) {
        continue;
      }
      msgRe.lastIndex = 0;
      if (allowPatterns.some((p) => p.test(line))) {
        continue;
      }
      failures.push(`${rel}:${i + 1} hardcoded notification string`);
    }
  }
}

function auditWebviewButtons() {
  if (!fs.existsSync(interactionDir)) {
    return;
  }
  for (const file of readAllTsFiles(interactionDir)) {
    const rel = path.relative(root, file).replace(/\\/g, '/');
    const content = fs.readFileSync(file, 'utf8');
    const buttonRe = /<button\b[^>]*>/gi;
    let m;
    while ((m = buttonRe.exec(content)) !== null) {
      const tag = m[0];
      if (!/aria-label\s*=/.test(tag) && !/role="tab"/.test(tag)) {
        failures.push(`${rel}: button missing aria-label: ${tag.slice(0, 80)}…`);
      }
    }
  }
}

function auditLiveRegions() {
  const conv = path.join(interactionDir, 'conversationPane.ts');
  const content = fs.readFileSync(conv, 'utf8');
  if (!content.includes('id="a11y-status"') || !content.includes('aria-live="assertive"')) {
    failures.push('conversationPane.ts missing assertive a11y status region');
  }
  if (!content.includes('announce(L.streamComplete)')) {
    failures.push('conversationPane.ts missing stream completion announcement');
  }
}

auditBundleParity();
auditHardcodedNotifications();
auditWebviewButtons();
auditLiveRegions();

if (failures.length) {
  console.error('i18n/a11y audit failed:\n' + failures.map((f) => `  - ${f}`).join('\n'));
  process.exit(1);
}

console.log('i18n/a11y audit passed');
