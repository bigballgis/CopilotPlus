#!/usr/bin/env node
/** Headless DOCS module smoke checks — R-DOCS-3/5/8/11 (no VS Code runtime) */

import { resolveScope, buildDocBreadcrumb, buildDocPreviewNav } from '../dist-test/docs/scopeResolution.js';
import { validateDocumentSize } from '../dist-test/docs/frontmatter.js';
import { CodeOwnershipIndex } from '../dist-test/docs/ownershipIndex.js';
import { computeLateralDepth } from '../dist-test/docs/lateralDepth.js';
import { NamingAliasStore } from '../dist-test/docs/namingAliases.js';
import { mapSubtreePaths, pathForRenamedId, patchLinksForRemovedIds } from '../dist-test/docs/treeOps.js';
import {
  isSummaryMissingOrInvalid,
  upsertSummarySection,
  SUMMARY_MIN_CHARS,
} from '../dist-test/docs/summarySection.js';

const errors = [];

function assert(cond, msg) {
  if (!cond) {
    errors.push(msg);
  }
}

function entry(relativePath, id, level, parent, children, secondary_parents) {
  return {
    relativePath,
    body: '\n## Summary\n\nTest.\n',
    valid: true,
    errors: [],
    frontmatter: {
      id,
      level,
      title: id,
      parent,
      children,
      secondary_parents,
      ai_generated: true,
    },
  };
}

// R-DOCS-5 secondary_parents
const entries = [
  entry('.copilotPlus/docs/system/app.md', 'app', 'system', '', ['auth']),
  entry('.copilotPlus/docs/system/app/auth.md', 'auth', 'module', 'app', ['login']),
  entry('.copilotPlus/docs/system/app/auth/login.md', 'login', 'feature', 'auth', [], ['billing']),
  entry('.copilotPlus/docs/system/app/billing.md', 'billing', 'module', 'app', []),
];
const scope = resolveScope('.copilotPlus/docs/system/app/auth/login.md', entries);
assert(
  scope.some((s) => s.document_path.includes('billing.md') && s.link_type === 'lateral'),
  'secondary_parents missing from scope'
);

// R-DOCS-3 breadcrumb
const crumbs = buildDocBreadcrumb('.copilotPlus/docs/system/app/auth/login.md', entries);
assert(crumbs.length === 3 && crumbs[0]?.title === 'app', 'breadcrumb chain invalid');

// R-DOCS-3.3 / R-DOCS-4.4 preview nav
const navEntries = [
  entry('.copilotPlus/docs/system/app.md', 'app', 'system', '', ['auth']),
  entry('.copilotPlus/docs/system/app/auth.md', 'auth', 'module', 'app', ['login'], undefined),
  entry('.copilotPlus/docs/system/app/auth/login.md', 'login', 'feature', 'auth', []),
  entry('.copilotPlus/docs/system/app/billing.md', 'billing', 'module', 'app', []),
];
navEntries[1].frontmatter.lateral = [{ target: 'billing', type: 'references' }];
const nav = buildDocPreviewNav('.copilotPlus/docs/system/app/auth.md', navEntries);
assert(nav.children.some((child) => child.path.includes('login.md')), 'preview nav children invalid');
assert(
  nav.lateralByType.references?.some((link) => link.path.includes('billing.md')),
  'preview nav lateral invalid'
);

// R-DOCS-8 size cap
const oversize = validateDocumentSize('component', 'x'.repeat(1001));
assert(!oversize.ok && oversize.reason === 'document_too_large', 'size cap not enforced');

// R-DOCS-11.1 index
const index = new CodeOwnershipIndex();
index.rebuild(
  [
    entry('.copilotPlus/docs/system/a.md', 'a', 'component', 'f', [], undefined),
  ].map((e) => ({
    ...e,
    frontmatter: { ...e.frontmatter, code_paths: ['src/a/**'] },
  })),
  ['src/a/foo.ts']
);
assert(index.lookup('src/a/foo.ts')?.orphan === false, 'ownership index lookup failed');

const aliasStore = new NamingAliasStore();
aliasStore.register('legacy', 'current');
assert(aliasStore.resolve('legacy') === 'current', 'naming alias resolve failed');

const depthEntries = [
  entry('.copilotPlus/docs/system/app.md', 'app', 'system', '', ['auth', 'billing']),
  entry('.copilotPlus/docs/system/app/auth.md', 'auth', 'module', 'app', ['login']),
  {
    ...entry('.copilotPlus/docs/system/app/auth/login.md', 'login', 'feature', 'auth', []),
    frontmatter: {
      ...entry('.copilotPlus/docs/system/app/auth/login.md', 'login', 'feature', 'auth', []).frontmatter,
      lateral: [{ target: 'billing', type: 'references' }],
    },
  },
  entry('.copilotPlus/docs/system/app/billing.md', 'billing', 'module', 'app', []),
];
const login = depthEntries.find((e) => e.frontmatter.id === 'login');
const billing = depthEntries.find((e) => e.frontmatter.id === 'billing');
assert(login && billing && computeLateralDepth(login, billing, depthEntries) === 3, 'lateral depth invalid');

// R-DOCS-6 subtree path migration
assert(
  pathForRenamedId('.copilotPlus/docs/system/app/auth.md', 'identity') ===
    '.copilotPlus/docs/system/app/identity.md',
  'pathForRenamedId invalid'
);
const subtreeMap = mapSubtreePaths(
  '.copilotPlus/docs/system/app/auth.md',
  '.copilotPlus/docs/system/app/identity.md',
  [
    '.copilotPlus/docs/system/app/auth.md',
    '.copilotPlus/docs/system/app/auth/login.md',
    '.copilotPlus/docs/system/app/billing.md',
  ]
);
assert(
  subtreeMap.get('.copilotPlus/docs/system/app/auth/login.md') ===
    '.copilotPlus/docs/system/app/identity/login.md',
  'mapSubtreePaths invalid'
);

// R-DOCS-6.5 inbound link cleanup on subtree delete
const deleteEntries = [
  entry('.copilotPlus/docs/system/app.md', 'app', 'system', '', ['leaf']),
  {
    ...entry('.copilotPlus/docs/system/app/leaf.md', 'leaf', 'module', 'app', []),
    frontmatter: {
      ...entry('.copilotPlus/docs/system/app/leaf.md', 'leaf', 'module', 'app', []).frontmatter,
      lateral: [{ target: 'peer', type: 'references' }],
    },
  },
  entry('.copilotPlus/docs/system/app/peer.md', 'peer', 'module', 'app', []),
];
const deletePatches = patchLinksForRemovedIds(deleteEntries, new Set(['peer']));
assert(deletePatches.length === 1 && deletePatches[0]?.frontmatter.lateral?.length === 0, 'patchLinksForRemovedIds invalid');

// R-DOCS-14.6 summary section
assert(isSummaryMissingOrInvalid('## Overview\n\nHello'), 'missing summary should be invalid');
assert(
  !isSummaryMissingOrInvalid(`## Summary\n\n${'x'.repeat(SUMMARY_MIN_CHARS)}`),
  'valid summary length should pass'
);
const summaryBody = upsertSummarySection('## Details\n\nMore', 'y'.repeat(SUMMARY_MIN_CHARS));
assert(/^## Summary\n\n/.test(summaryBody), 'upsertSummarySection invalid');

if (errors.length > 0) {
  console.error('DOCS smoke verification FAILED (run npm run compile first)');
  for (const err of errors) {
    console.error(`  - ${err}`);
  }
  process.exit(1);
}

console.log(
  'DOCS smoke verification OK (scope, breadcrumb, preview nav, size cap, ownership, aliases, lateral depth, tree ops, summary)'
);
