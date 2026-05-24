import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseConsistencyVerdict } from '../../docs/consistencyVerdict.js';

describe('R-DOCS-12.4 consistency verdict parsing', () => {
  it('parses JSON verdict objects', () => {
    const verdict = parseConsistencyVerdict(`
\`\`\`json
{
  "status": "Doc_Update_Recommended",
  "summary": "Summary section outdated",
  "proposed_doc_path": ".copilotPlus/docs/component/x.md",
  "proposed_doc_content": "---\\nid: x\\n---\\n## Summary\\nUpdated"
}
\`\`\`
`);
    assert.equal(verdict.status, 'Doc_Update_Recommended');
    assert.equal(verdict.summary, 'Summary section outdated');
    assert.equal(verdict.proposedDocPath, '.copilotPlus/docs/component/x.md');
    assert.ok(verdict.proposedDocContent?.includes('Updated'));
  });

  it('detects code mismatch from free text', () => {
    const verdict = parseConsistencyVerdict('Code mismatch suspected: API contract differs from doc.');
    assert.equal(verdict.status, 'Code_Mismatch_Suspected');
  });

  it('detects consistent status', () => {
    const verdict = parseConsistencyVerdict('The component doc is consistent with the implementation.');
    assert.equal(verdict.status, 'Consistent');
  });

  it('defaults unknown responses to Cannot_Determine', () => {
    const verdict = parseConsistencyVerdict('Need more context to compare layers.');
    assert.equal(verdict.status, 'Cannot_Determine');
  });
});
