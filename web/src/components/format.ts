export function formatCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(n < 10_000_000 ? 1 : 0)}M`;
}

export function formatMiB(m: number | undefined): string {
  if (m === undefined) return '—';
  if (m >= 1024) return `${(m / 1024).toFixed(2)} GiB`;
  return `${m.toFixed(m < 10 ? 2 : 0)} MiB`;
}

export function formatPercent(f: number): string {
  return `${(f * 100).toFixed(0)}%`;
}

export function formatTokensPerSecond(v: number | undefined): string {
  if (v === undefined) return '—';
  return `${v.toFixed(v < 10 ? 2 : v < 100 ? 1 : 0)} tok/s`;
}

export function formatMs(ms: number | undefined): string {
  if (ms === undefined) return '—';
  if (ms < 1000) return `${ms.toFixed(0)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}
