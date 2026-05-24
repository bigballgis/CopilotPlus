/** Build pipeline user decision routing — R-WF-4.5, R-WF-4.9, R-INT-10.5 */

export type BuildFailureAction = 'retry' | 'skip' | 'terminate' | 'pause' | 'fail';

export function interpretTestExhaustedDecision(
  selected: string,
  timedOut: boolean
): BuildFailureAction {
  if (selected === 'Pause Task') {
    return 'pause';
  }
  if (selected === 'Retry_Task') {
    return 'retry';
  }
  if (selected === 'Skip_Task') {
    return 'skip';
  }
  if (selected === 'Terminate_Build') {
    return 'terminate';
  }
  return timedOut ? 'fail' : 'fail';
}

export function interpretCommitFailureDecision(selected: string): BuildFailureAction {
  if (selected === 'Pause Task') {
    return 'pause';
  }
  if (selected === 'Retry_Commit') {
    return 'retry';
  }
  if (selected === 'Skip_Commit') {
    return 'skip';
  }
  if (selected === 'Terminate_Task') {
    return 'terminate';
  }
  return 'fail';
}

export function interpretReviewDecision(selected: string, timedOut: boolean): BuildFailureAction {
  if (selected === 'Pause Task') {
    return 'pause';
  }
  if (selected === 'Feed_to_Coder') {
    return 'retry';
  }
  if (selected === 'Accept_anyway') {
    return 'skip';
  }
  if (selected === 'Terminate') {
    return 'terminate';
  }
  return timedOut ? 'fail' : 'fail';
}

/** R-WF-5.5 — rollback build chain failure */
export function interpretRollbackBuildDecision(
  selected: string,
  timedOut: boolean
): BuildFailureAction {
  if (selected === 'Retry') {
    return 'retry';
  }
  if (selected === 'Skip') {
    return 'skip';
  }
  if (selected === 'Terminate') {
    return 'terminate';
  }
  return timedOut ? 'terminate' : 'fail';
}
