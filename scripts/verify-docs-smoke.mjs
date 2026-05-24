#!/usr/bin/env node
/** Headless DOCS module smoke checks — R-DOCS-3/5/8/11 (no VS Code runtime) */

import { resolveScope, buildDocBreadcrumb } from '../dist-test/docs/scopeResolution.js';
import { validateDocumentSize } from '../dist-test/docs/frontmatter.js';
import { CodeOwnershipIndex } from '../dist-test/docs/ownershipIndex.js';

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

if (errors.length > 0) {
  console.error('DOCS smoke verification FAILED (run npm run compile first)');
  for (const err of errors) {
    console.error(`  - ${err}`);
  }
  process.exit(1);
}

console.log('DOCS smoke verification OK (scope, breadcrumb, size cap, ownership index)');
