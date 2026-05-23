/** CLI argument parsing — R-DEP-7 (testable, headless-safe) */

export type CliCommand =
  | { kind: 'build'; action: 'run' | 'status' | 'cancel'; param: string }
  | { kind: 'deploy'; action: 'run'; param: string }
  | { kind: 'usage' };

export interface CliParseResult {
  command: CliCommand;
  exitCode: 0 | 1;
}

export function parseCliArgs(args: string[]): CliParseResult {
  if (args.length === 0) {
    return { command: { kind: 'usage' }, exitCode: 1 };
  }

  const [domain, action, param] = args;

  if (domain === 'build') {
    if ((action === 'run' || action === 'status' || action === 'cancel') && param) {
      return { command: { kind: 'build', action, param }, exitCode: 0 };
    }
  }

  if (domain === 'deploy' && action === 'run' && param) {
    return { command: { kind: 'deploy', action: 'run', param }, exitCode: 0 };
  }

  return { command: { kind: 'usage' }, exitCode: 1 };
}

export const CLI_USAGE_LINES = [
  'copilot-plus CLI (invoke via: Copilot Plus: CLI or copilotPlus.cli command)',
  '  build run <build-config.json>',
  '  build status <build-id>',
  '  build cancel <build-id>',
  '  deploy run <Local|Docker|Kubernetes>',
  '',
  'Headless (VS Code enterprise build with extension installed):',
  '  code --folder-uri <workspace> --headless --command copilotPlus.cli -- build run <config>',
] as const;
