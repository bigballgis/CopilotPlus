interface VsCodeApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare global {
  interface Window {
    acquireVsCodeApi?: () => VsCodeApi;
  }
}

let api: VsCodeApi | undefined;

export function getVsCodeApi(): VsCodeApi {
  if (!api) {
    if (!window.acquireVsCodeApi) {
      throw new Error('VS Code webview API unavailable');
    }
    api = window.acquireVsCodeApi();
  }
  return api;
}

export function postToHost(message: unknown): void {
  getVsCodeApi().postMessage(message);
}
