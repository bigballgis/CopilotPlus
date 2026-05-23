/** Coder post-edit LSP verification — R-AG-6 */

import {
  filterErrorDiagnostics,
  getDiagnostics,
  type LspDiagnostic,
} from '../tools/lspTools';

export interface VerificationResult {
  ok: boolean;
  skipped?: boolean;
  regression_diagnostics?: LspDiagnostic[];
  message?: string;
}

export class PostEditTracker {
  private edited = new Set<string>();
  private baseline = new Map<string, LspDiagnostic[]>();

  constructor(private readonly onEdit?: (relativePath: string) => void) {}

  clear(): void {
    this.edited.clear();
    this.baseline.clear();
  }

  async recordEdit(relativePath: string): Promise<void> {
    const norm = relativePath.replace(/\\/g, '/');
    if (!this.baseline.has(norm)) {
      try {
        const diags = await getDiagnostics([norm]);
        this.baseline.set(
          norm,
          filterErrorDiagnostics(diags.filter((d) => d.file === norm))
        );
      } catch {
        this.baseline.set(norm, []);
      }
    }
    this.edited.add(norm);
    this.onEdit?.(norm);
  }

  async verify(): Promise<VerificationResult> {
    const paths = [...this.edited];
    if (!paths.length) {
      return { ok: true };
    }

    let diags: LspDiagnostic[];
    try {
      diags = await getDiagnostics(paths);
    } catch {
      return { ok: true, skipped: true, message: 'LSP unavailable' };
    }

    const regressions: LspDiagnostic[] = [];
    for (const filePath of paths) {
      const before = this.baseline.get(filePath) ?? [];
      const after = filterErrorDiagnostics(diags.filter((d) => d.file === filePath));
      for (const diag of after) {
        const key = diagKey(diag);
        if (!before.some((b) => diagKey(b) === key)) {
          regressions.push(diag);
        }
      }
    }

    if (regressions.length) {
      return { ok: false, regression_diagnostics: regressions };
    }
    return { ok: true };
  }
}

function diagKey(d: LspDiagnostic): string {
  return `${d.file}:${d.range.start.line}:${d.message}`;
}
