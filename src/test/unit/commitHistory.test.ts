import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  extractTaskId,
  parseFilesChangedFromStat,
  parseGitCommitHash,
} from '../../editing/commitHistoryParse.js';

describe('commitHistory helpers', () => {
  it('parseGitCommitHash reads bracket and loose formats', () => {
    const hash = 'a'.repeat(40);
    assert.equal(parseGitCommitHash(`[main ${hash}] commit message`), hash);
    assert.equal(parseGitCommitHash(`created ${hash}`), hash);
    assert.equal(parseGitCommitHash('no hash here'), undefined);
  });

  it('extractTaskId finds task identifiers in messages', () => {
    assert.equal(extractTaskId('feat: task-auth-1 login flow'), 'task-auth-1');
    assert.equal(extractTaskId('plain commit'), undefined);
  });

  it('parseFilesChangedFromStat reads shortstat output', () => {
    assert.equal(parseFilesChangedFromStat(' 3 files changed, 10 insertions(+), 2 deletions(-)'), 3);
    assert.equal(parseFilesChangedFromStat(' 1 file changed, 1 insertion(+)'), 1);
    assert.equal(parseFilesChangedFromStat('no stats'), 0);
  });
});
