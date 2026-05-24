import { VSCodeButton, VSCodeDropdown, VSCodeOption } from '@vscode/webview-ui-toolkit/react';
import type { ConversationLabels, DesignStepOptionWire } from '@shared/conversationWebviewProtocol';
import { ActionBar } from './ActionBar';
import { Icon } from './Icon';

interface DesignStepBarProps {
  labels: ConversationLabels;
  steps: DesignStepOptionWire[];
  canContinue: boolean;
  continueBlockedReason?: string;
  isFinalStep: boolean;
  disabled?: boolean;
  onContinue: () => void;
  onPickStep: (stepId: string) => void;
}

function stepOptionLabel(step: DesignStepOptionWire, labels: ConversationLabels): string {
  const marker = step.current ? '●' : step.complete ? '✓' : '○';
  return `${marker} ${step.label}`;
}

function stepOptionTitle(step: DesignStepOptionWire, labels: ConversationLabels): string {
  if (step.current) {
    return `${step.label} (${labels.stepCurrent})`;
  }
  if (step.complete) {
    return `${step.label} (${labels.stepComplete})`;
  }
  if (step.missing.length > 0) {
    return `${step.label} — ${step.missing.join(', ')}`;
  }
  return step.label;
}

export function DesignStepBar({
  labels,
  steps,
  canContinue,
  continueBlockedReason,
  isFinalStep,
  disabled,
  onContinue,
  onPickStep,
}: DesignStepBarProps): JSX.Element {
  const current = steps.find((step) => step.current);
  const currentId = current?.id ?? steps[0]?.id ?? '';

  const continueDisabled = disabled || isFinalStep || !canContinue;
  const continueTitle =
    continueDisabled && continueBlockedReason ? continueBlockedReason : undefined;

  return (
    <div className="cp-design-bar">
      <ActionBar>
        <VSCodeButton
          disabled={continueDisabled}
          appearance="primary"
          aria-label={labels.continueAria}
          title={continueTitle}
          onClick={onContinue}
        >
          <Icon name="arrow-right" />
          {labels.continueLabel}
        </VSCodeButton>

        <label className="cp-design-step-picker">
          <span className="cp-design-step-picker-label">{labels.pickStepLabel}</span>
          <VSCodeDropdown
            value={currentId}
            disabled={disabled}
            aria-label={labels.pickStepAria}
            onChange={(event) => {
              const step = (event.target as HTMLSelectElement).value;
              if (step && step !== currentId) {
                onPickStep(step);
              }
            }}
          >
            {steps.length === 0 ? (
              <VSCodeOption value="">{labels.pickStepPlaceHolder}</VSCodeOption>
            ) : (
              steps.map((step) => (
                <VSCodeOption key={step.id} value={step.id} title={stepOptionTitle(step, labels)}>
                  {stepOptionLabel(step, labels)}
                </VSCodeOption>
              ))
            )}
          </VSCodeDropdown>
        </label>
      </ActionBar>
      {continueTitle && !isFinalStep ? (
        <p className="cp-design-bar-hint" role="status">
          {continueTitle}
        </p>
      ) : null}
    </div>
  );
}
