export function formatElapsedMs(ms: number | undefined): string {
  if (ms === undefined) {
    return '—';
  }
  const totalSec = Math.floor(ms / 1000);
  if (totalSec < 60) {
    return `${totalSec}s`;
  }
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min < 60) {
    return `${min}m ${sec}s`;
  }
  const hr = Math.floor(min / 60);
  const remMin = min % 60;
  return `${hr}h ${remMin}m`;
}
