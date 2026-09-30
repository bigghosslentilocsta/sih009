/**
 * Shared colour scale + formatting helpers for the suitability overlay.
 * The ramp mirrors the backend classification bands so the map and the side
 * panel always agree.
 */

export const CLASSIFICATION_BANDS = [
  { key: 'very_low', label: 'Very low', min: 0, max: 20, color: '#475569' },
  { key: 'low', label: 'Low', min: 20, max: 40, color: '#3b82f6' },
  { key: 'moderate', label: 'Moderate', min: 40, max: 60, color: '#eab308' },
  { key: 'high', label: 'High', min: 60, max: 75, color: '#f97316' },
  { key: 'very_high', label: 'Very high', min: 75, max: 100, color: '#dc2626' },
];

/** Map a 0-100 suitability score onto the ramp. */
export function scoreColor(score) {
  const value = Math.max(0, Math.min(100, Number(score) || 0));
  const band = CLASSIFICATION_BANDS.find((b) => value >= b.min && value < b.max);
  return (band ?? CLASSIFICATION_BANDS.at(-1)).color;
}

export function bandLabel(score) {
  const value = Math.max(0, Math.min(100, Number(score) || 0));
  const band = CLASSIFICATION_BANDS.find((b) => value >= b.min && value < b.max);
  return (band ?? CLASSIFICATION_BANDS.at(-1)).label;
}

/** Tailwind text colour matching the band, for the side panel. */
export function bandTextColor(score) {
  const value = Math.max(0, Math.min(100, Number(score) || 0));
  if (value >= 75) return 'text-rose-600';
  if (value >= 60) return 'text-orange-600';
  if (value >= 40) return 'text-amber-600';
  if (value >= 20) return 'text-blue-600';
  return 'text-slate-600';
}

export const formatNumber = (value, digits = 2) =>
  value === null || value === undefined || Number.isNaN(Number(value))
    ? '—'
    : Number(value).toFixed(digits);

export const formatArea = (km2) =>
  km2 === null || km2 === undefined ? '—' : `${Number(km2).toFixed(1)} km²`;

export const formatTime = (iso) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
};
