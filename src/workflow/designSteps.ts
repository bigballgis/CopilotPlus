/** Design workflow steps — R-WF-2, R-AG-2.1 */

export const DESIGN_STEPS = [
  'Requirement_Clarification',
  'Architecture_Generation',
  'Design_Document_Generation',
  'Task_List_Generation',
] as const;

export type DesignWorkflowStep = (typeof DESIGN_STEPS)[number];

export const DESIGN_STEP_TO_ROLE: Record<DesignWorkflowStep, string> = {
  Requirement_Clarification: 'Requirement_Clarifier',
  Architecture_Generation: 'Architect',
  Design_Document_Generation: 'Designer',
  Task_List_Generation: 'Task_Planner',
};

export function roleForDesignStep(step: DesignWorkflowStep): string {
  return DESIGN_STEP_TO_ROLE[step];
}

export function isDesignWorkflowStep(value: string): value is DesignWorkflowStep {
  return (DESIGN_STEPS as readonly string[]).includes(value);
}

export function nextDesignStep(step: DesignWorkflowStep): DesignWorkflowStep | undefined {
  const idx = DESIGN_STEPS.indexOf(step);
  if (idx < 0 || idx >= DESIGN_STEPS.length - 1) {
    return undefined;
  }
  return DESIGN_STEPS[idx + 1];
}

export function designStepLabel(step: DesignWorkflowStep): string {
  return step.replace(/_/g, ' ');
}
