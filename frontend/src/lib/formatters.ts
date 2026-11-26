/**
 * Format integer minor EGP units (piasters) into display currency.
 * Never performs float math for persistence; display-only integer division.
 */
export function formatEgpPrice(priceMinor: number | null | undefined): string {
  if (priceMinor === null || priceMinor === undefined) {
    return '—';
  }
  if (priceMinor === 0) {
    return 'Free';
  }
  const major = Math.floor(priceMinor / 100);
  const minor = Math.abs(priceMinor % 100);
  const formattedMajor = major.toLocaleString('en-US');
  if (minor === 0) {
    return `EGP ${formattedMajor}`;
  }
  return `EGP ${formattedMajor}.${String(minor).padStart(2, '0')}`;
}

/**
 * Format integer EGP minor units strictly with EGP prefix (even when 0),
 * e.g. for order totals, payouts, and finance ledgers.
 */
export function formatEgpAmount(amountMinor: number | null | undefined): string {
  if (amountMinor === null || amountMinor === undefined) {
    return '—';
  }
  const sign = amountMinor < 0 ? '-' : '';
  const abs = Math.abs(amountMinor);
  const major = Math.floor(abs / 100);
  const minor = abs % 100;
  const formattedMajor = major.toLocaleString('en-US');
  if (minor === 0) {
    return `${sign}EGP ${formattedMajor}`;
  }
  return `${sign}EGP ${formattedMajor}.${String(minor).padStart(2, '0')}`;
}

/**
 * Format duration from seconds to a clean human-readable display string.
 * A null/undefined total means incomplete duration data and must NEVER be displayed as 0.
 */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) {
    return 'Duration unavailable';
  }
  const totalSeconds = Math.floor(seconds);
  if (totalSeconds === 0) {
    return '0m';
  }
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  if (minutes > 0) {
    return secs > 0 ? `${minutes}m ${secs}s` : `${minutes}m`;
  }
  return `${secs}s`;
}

/**
 * Format lesson playback timer (e.g. 04:12 or 1:02:05) from seconds.
 */
export function formatTimestamp(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) {
    return '--:--';
  }
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (hours > 0) {
    return `${hours}:${pad(minutes)}:${pad(secs)}`;
  }
  return `${pad(minutes)}:${pad(secs)}`;
}
