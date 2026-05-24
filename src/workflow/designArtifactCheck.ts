/** Design step artifact completeness — R-WF-2.4–2.7, R-WF-2.8 */

import type { DocLevel } from '../docs/frontmatter';
import { validateTaskDag, type TaskDagFile } from './taskDag';
import type { DesignWorkflowStep } from './designSteps';

export interface DocArtifactSummary {
  level: DocLevel;
  valid: boolean;
}

export interface DesignStepArtifactStatus {
  step: DesignWorkflowStep;
  complete: boolean;
  missing: string[];
}

function countValid(docs: DocArtifactSummary[], level: DocLevel): number {
  return docs.filter((d) => d.valid && d.level === level).length;
}

export function checkDesignStepArtifacts(
  step: DesignWorkflowStep,
  docs: DocArtifactSummary[],
  tasks?: TaskDagFile
): DesignStepArtifactStatus {
  const missing: string[] = [];

  switch (step) {
    case 'Requirement_Clarification': {
      if (countValid(docs, 'system') < 1) {
        missing.push('system document');
      }
      if (countValid(docs, 'module') < 1) {
        missing.push('module document');
      }
      break;
    }
    case 'Architecture_Generation': {
      if (countValid(docs, 'module') < 1) {
        missing.push('module document');
      }
      if (countValid(docs, 'feature') < 1) {
        missing.push('feature document');
      }
      break;
    }
    case 'Design_Document_Generation': {
      if (countValid(docs, 'feature') < 1) {
        missing.push('feature document');
      }
      if (countValid(docs, 'component') < 1) {
        missing.push('component document');
      }
      break;
    }
    case 'Task_List_Generation': {
      const taskCount = tasks?.tasks.length ?? 0;
      if (taskCount < 1) {
        missing.push('tasks.json with at least one task');
      } else if (tasks) {
        const errors = validateTaskDag(tasks);
        if (errors.length) {
          missing.push('valid tasks.json');
        }
      }
      break;
    }
  }

  return { step, complete: missing.length === 0, missing };
}

export function canAdvanceFromStep(
  step: DesignWorkflowStep,
  docs: DocArtifactSummary[],
  tasks?: TaskDagFile
): boolean {
  return checkDesignStepArtifacts(step, docs, tasks).complete;
}
