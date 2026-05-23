/** Classify Conversation Pane input into a Design Workflow Step — R-AG-3.1 */

import {
  DESIGN_STEPS,
  type DesignWorkflowStep,
  roleForDesignStep,
} from './designSteps';

export interface DesignClassification {
  step: DesignWorkflowStep;
  role: string;
  reason: 'explicit' | 'continue' | 'keyword' | 'current';
}

const STEP_ALIASES: Record<DesignWorkflowStep, RegExp[]> = {
  Requirement_Clarification: [
    /\brequirement[\s_-]?clarif/i,
    /\brequirement[\s_-]?clarifier\b/i,
    /需求澄清/,
    /澄清需求/,
  ],
  Architecture_Generation: [
    /\barchitecture[\s_-]?gener/i,
    /\barchitect\b/i,
    /架构设计/,
    /系统架构/,
  ],
  Design_Document_Generation: [
    /\bdesign[\s_-]?doc/i,
    /\bdesigner\b/i,
    /设计文档/,
    /组件文档/,
    /功能文档/,
  ],
  Task_List_Generation: [
    /\btask[\s_-]?list/i,
    /\btask[\s_-]?planner\b/i,
    /任务列表/,
    /任务分解/,
    /拆分任务/,
  ],
};

const KEYWORD_HINTS: Record<DesignWorkflowStep, RegExp[]> = {
  Requirement_Clarification: [
    /\brequirement(s)?\b/i,
    /\bclarif(y|ication)\b/i,
    /\bscope\b/i,
    /\buser story\b/i,
    /需求/,
    /范围/,
    /目标/,
  ],
  Architecture_Generation: [
    /\barchitecture\b/i,
    /\bmodule(s)?\b/i,
    /\bcomponent(s)?\b/i,
    /\bstructure\b/i,
    /\bdiagram\b/i,
    /架构/,
    /模块/,
    /分层/,
  ],
  Design_Document_Generation: [
    /\bfeature doc(s)?\b/i,
    /\bcomponent doc(s)?\b/i,
    /\bapi design\b/i,
    /\bui\b/i,
    /\binterface(s)?\b/i,
    /接口/,
    /交互/,
    /文档/,
  ],
  Task_List_Generation: [
    /\btask(s)?\b/i,
    /\bdag\b/i,
    /\bbreak[\s-]?down\b/i,
    /\btodo(s)?\b/i,
    /\bimplement(ation)? plan\b/i,
    /任务/,
    /分解/,
    /排期/,
  ],
};

const CONTINUE_PATTERN =
  /^(continue|next(\s+step)?|proceed|go\s+on|下一步|继续)[.!?\s]*$/i;

const EXPLICIT_STEP_PATTERN =
  /(?:^|\s)(?:\/step[:]\s*|step[:]\s*|\[)(requirement[\s_-]?clarification|architecture[\s_-]?generation|design[\s_-]?document[\s_-]?generation|task[\s_-]?list[\s_-]?generation|requirement[\s_-]?clarifier|architect|designer|task[\s_-]?planner)(?:\]|\s|$)/i;

export function classifyDesignMessage(
  text: string,
  currentStep: DesignWorkflowStep
): DesignClassification {
  const trimmed = text.trim();
  if (!trimmed) {
    return wrap(currentStep, 'current');
  }

  if (CONTINUE_PATTERN.test(trimmed)) {
    return wrap(currentStep, 'continue');
  }

  const explicit = parseExplicitStep(trimmed);
  if (explicit) {
    return wrap(explicit, 'explicit');
  }

  let best: DesignWorkflowStep | undefined;
  let bestScore = 0;
  for (const step of DESIGN_STEPS) {
    const score = scoreStep(trimmed, step);
    if (score > bestScore) {
      bestScore = score;
      best = step;
    }
  }

  if (best && bestScore > 0) {
    return wrap(best, 'keyword');
  }

  return wrap(currentStep, 'current');
}

export function shouldAdvanceDesignStep(text: string): boolean {
  return CONTINUE_PATTERN.test(text.trim());
}

function wrap(step: DesignWorkflowStep, reason: DesignClassification['reason']): DesignClassification {
  return { step, role: roleForDesignStep(step), reason };
}

function parseExplicitStep(text: string): DesignWorkflowStep | undefined {
  const match = text.match(EXPLICIT_STEP_PATTERN);
  if (!match) {
    return undefined;
  }
  const token = match[1].toLowerCase().replace(/[\s-]+/g, '_');
  if (token.includes('requirement')) {
    return 'Requirement_Clarification';
  }
  if (token.includes('architecture') || token === 'architect') {
    return 'Architecture_Generation';
  }
  if (token.includes('design') || token === 'designer') {
    return 'Design_Document_Generation';
  }
  if (token.includes('task') || token.includes('planner')) {
    return 'Task_List_Generation';
  }
  return undefined;
}

function scoreStep(text: string, step: DesignWorkflowStep): number {
  let score = 0;
  for (const pattern of [...STEP_ALIASES[step], ...KEYWORD_HINTS[step]]) {
    if (pattern.test(text)) {
      score += 1;
    }
  }
  return score;
}
