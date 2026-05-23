/** Semver comparison for R-PLAT-1.3 */

export function compareSemver(a: string, b: string): number {
  const parse = (v: string): number[] =>
    v.split('-')[0]?.split('.').map((part) => parseInt(part, 10) || 0) ?? [0, 0, 0];

  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }
  return 0;
}

export function isSupportedHostVersion(hostVersion: string, minimum: string): boolean {
  return compareSemver(hostVersion, minimum) >= 0;
}
