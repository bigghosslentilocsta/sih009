/**
 * Side panel showing the AI geological breakdown for the analysed zone,
 * plus a CSV export of the findings.
 */

import { useMemo } from 'react';

import Alert from '../ui/Alert.jsx';
import Button from '../ui/Button.jsx';
import {
  CLASSIFICATION_BANDS,
  bandLabel,
  bandTextColor,
  formatArea,
  formatNumber,
  formatTime,
  scoreColor,
} from './suitability.js';

const FACTORS = [
  { key: 'iron_oxide', label: 'Iron oxide ratio', weight: '40%', hint: 'Ferric iron surface signature' },
  { key: 'clay_mineral', label: 'Clay mineral index', weight: '30%', hint: 'Argillic alteration' },
  { key: 'vegetation_exposure', label: 'Vegetation exposure', weight: '15%', hint: 'Barren surface favours laterite' },
  { key: 'terrain', label: 'Terrain suitability', weight: '15%', hint: 'Slope for open-pit access' },
];

function Row({ label, value }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <p className="min-w-0 text-sm text-slate-700">{label}</p>
      <p className="shrink-0 font-mono text-sm font-semibold text-slate-800">{value}</p>
    </div>
  );
}

/** CSV export: zone summary, factor breakdown and the per-cell heatmap. */
function buildCsv(result) {
  const i = result.geological_indicators ?? {};
  return [
    '# SIH 26009 - Manganese Suitability Report',
    `# Zone,${result.name}`,
    `# Zone ID,${result.zone_id}`,
    `# Area (km2),${result.area_km2}`,
    `# Suitability score,${result.suitability_score}`,
    `# Classification,${result.classification}`,
    `# Confidence,${result.confidence_level} (${result.confidence_score})`,
    `# Data source,${result.data_source}`,
    `# Analyzed at,${result.analyzed_at}`,
    '',
    '## Geological indicators',
    'indicator,value',
    `iron_oxide_ratio,${i.iron_oxide_ratio}`,
    `clay_index,${i.clay_index}`,
    `ndvi,${i.ndvi}`,
    `red_edge_ratio,${i.red_edge_ratio}`,
    `elevation_m,${i.elevation_m}`,
    `slope_deg,${i.slope_deg}`,
    '',
    '## Score breakdown',
    'factor,score,weight',
    ...FACTORS.map((f) => `${f.key},${result.breakdown?.[f.key]},${f.weight}`),
    '',
    '## Heatmap cells',
    'lat,lng,score,classification',
    ...(result.heatmap ?? []).map((c) => `${c.lat},${c.lng},${c.score},${bandLabel(c.score)}`),
  ].join('\n');
}

export default function ZoneAnalysisPanel({ result, loading, error, onClose, onClear }) {
  const csv = useMemo(() => (result ? buildCsv(result) : ''), [result]);

  function exportCsv() {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${result.name.replace(/[^\w-]+/g, '_')}_suitability.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  if (error) {
    return (
      <div className="card">
        <Alert tone="error" title="Analysis failed">
          {error}
        </Alert>
        <Button variant="secondary" className="mt-3 w-full" onClick={onClear}>
          Back to map
        </Button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="card flex flex-col items-center py-10 text-center">
        <div className="mb-3 h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-brand-500" />
        <p className="text-sm font-medium text-slate-700">Analysing zone...</p>
        <p className="mt-1 text-xs text-slate-500">
          Building the Sentinel-2 composite and reducing over the polygon. This can take 30-60
          seconds.
        </p>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="card">
        <p className="text-sm text-slate-500">
          Select a pre-defined block on the map or draw a custom polygon, then run an analysis to
          see geological insights here.
        </p>
      </div>
    );
  }

  const ind = result.geological_indicators ?? {};

  return (
    <div className="space-y-4">
      {/* Headline score */}
      <div className="card">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-slate-800">{result.name}</h3>
            <p className="text-xs text-slate-500">{formatArea(result.area_km2)}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Dismiss results"
          >
            &times;
          </button>
        </div>

        <div className="mt-4 flex items-end gap-3">
          <span className={`text-4xl font-bold ${bandTextColor(result.suitability_score)}`}>
            {formatNumber(result.suitability_score, 1)}
          </span>
          <span className="pb-1 text-sm text-slate-500">/ 100</span>
          <span
            className="mb-1 ml-auto inline-block rounded-full px-2.5 py-1 text-xs font-semibold text-white"
            style={{ backgroundColor: scoreColor(result.suitability_score) }}
          >
            {bandLabel(result.suitability_score)}
          </span>
        </div>

        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${result.suitability_score}%`,
              backgroundColor: scoreColor(result.suitability_score),
            }}
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
          <span className="rounded bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
            Confidence: {result.confidence_level} ({Math.round(result.confidence_score * 100)}%)
          </span>
          <span
            className={`rounded px-2 py-0.5 font-medium ${
              result.data_source === 'earth_engine'
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-amber-50 text-amber-700'
            }`}
          >
            {result.data_source === 'earth_engine' ? 'Live Earth Engine' : 'Simulated model'}
          </span>
        </div>
      </div>

      {result.data_source !== 'earth_engine' && (
        <Alert tone="warning" title="Simulated result">
          Earth Engine was unavailable, so this score comes from the deterministic fallback model
          and should not be used for decisions.
        </Alert>
      )}


      {/* Breakdown */}
      <div className="card">
        <h4 className="card-title mb-2">Score breakdown</h4>
        <div className="divide-y divide-slate-100">
          {FACTORS.map((factor) => {
            const value = result.breakdown?.[factor.key] ?? 0;
            return (
              <div key={factor.key} className="py-2">
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <span className="text-sm text-slate-700">
                    {factor.label}
                    <span className="ml-1.5 text-[11px] text-slate-400">({factor.weight})</span>
                  </span>
                  <span className="font-mono text-sm font-semibold text-slate-800">
                    {formatNumber(value, 0)}
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${value}%`, backgroundColor: scoreColor(value) }}
                  />
                </div>
                <p className="mt-0.5 text-[11px] text-slate-400">{factor.hint}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Raw indicators */}
      <div className="card">
        <h4 className="card-title mb-1">Geological indicators</h4>
        <div className="divide-y divide-slate-100">
          <Row label="Iron oxide ratio" value={formatNumber(ind.iron_oxide_ratio, 3)} />
          <Row label="Clay index" value={formatNumber(ind.clay_index, 3)} />
          <Row label="NDVI" value={formatNumber(ind.ndvi, 3)} />
          <Row label="Red edge ratio" value={formatNumber(ind.red_edge_ratio, 3)} />
          <Row
            label="Mean elevation"
            value={ind.elevation_m != null ? `${ind.elevation_m} m` : '—'}
          />
          <Row label="Mean slope" value={ind.slope_deg != null ? `${ind.slope_deg}°` : '—'} />
        </div>
      </div>

      {/* Legend */}
      <div className="card">
        <h4 className="card-title mb-2">Heatmap legend</h4>
        <div className="space-y-1">
          {CLASSIFICATION_BANDS.map((band) => (
            <div key={band.key} className="flex items-center gap-2 text-xs">
              <span className="h-3 w-6 shrink-0 rounded" style={{ backgroundColor: band.color }} />
              <span className="text-slate-600">
                {band.label} ({band.min}-{band.max})
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Recommendation */}
      <div
        className="card border-l-4"
        style={{ borderLeftColor: scoreColor(result.suitability_score) }}
      >
        <h4 className="card-title mb-1">Recommendation</h4>
        <p className="text-sm leading-relaxed text-slate-700">{result.recommendation}</p>
        {result.analyzedBy && (
          <p className="mt-2 text-[11px] text-slate-400">
            Analysed by {result.analyzedBy.name} - {formatTime(result.analyzed_at)}
          </p>
        )}
      </div>

      <Button onClick={exportCsv} className="w-full">
        Export summary (CSV)
      </Button>
    </div>
  );
}
