/** NES delegate status (vscode-free) — R-EDIT-7 */

import type { CopilotPlusSettings } from '../platform/configuration';

export interface NesDelegateStatus {
  mode: CopilotPlusSettings['nesMode'];
  copilotDetected: boolean;
  copilotActive: boolean;
  noticeKey?: string;
}

export interface CopilotExtensionProbe {
  installed: boolean;
  active: boolean;
}

export function describeNesDelegateStatus(
  settings: Pick<CopilotPlusSettings, 'nesMode'>,
  probe: CopilotExtensionProbe
): NesDelegateStatus {
  if (settings.nesMode === 'delegate_to_copilot' && !probe.installed) {
    return {
      mode: settings.nesMode,
      copilotDetected: false,
      copilotActive: false,
      noticeKey: 'nes.copilotMissing',
    };
  }
  return {
    mode: settings.nesMode,
    copilotDetected: probe.installed,
    copilotActive: probe.active,
  };
}
