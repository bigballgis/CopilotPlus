/** Register VS Code Webview UI Toolkit design system once per bundle. */

import { provideVSCodeDesignSystem } from '@vscode/webview-ui-toolkit';

let registered = false;

export function ensureToolkitDesignSystem(): void {
  if (registered) {
    return;
  }
  provideVSCodeDesignSystem();
  registered = true;
}
