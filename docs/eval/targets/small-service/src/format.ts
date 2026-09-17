const BYTE_UNITS = ['KiB', 'MiB', 'GiB', 'TiB'] as const;

/** Formats a byte count using binary units, to one decimal place above a kibibyte. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return 'unknown';
  if (bytes < 1024) return `${bytes} B`;

  let value = bytes / 1024;
  let unit = BYTE_UNITS[0];
  for (const next of BYTE_UNITS) {
    unit = next;
    if (value < 1024) break;
    value /= 1024;
  }
  return `${value.toFixed(1)} ${unit}`;
}

/** Formats a duration in milliseconds as a short human-readable string. */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return 'unknown';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}

/** Truncates text to a maximum length, marking that it was cut. */
export function truncate(text: string, max: number): string {
  if (max <= 0) return '';
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1))}…`;
}
