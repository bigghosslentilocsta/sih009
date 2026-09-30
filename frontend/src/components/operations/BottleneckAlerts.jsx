/**
 * AI Bottleneck Alert Box.
 *
 * Surfaces the ranked risks returned by the ai-service, headed by a one-line
 * plain-English summary of the projected shortfall.
 */

import { RISK_COLORS } from '../../lib/operations.js';

const SEVERITY = {
  critical: { bar: 'bg-rose-500', chip: 'bg-rose-100 text-rose-700', label: 'Critical' },
  warning: { bar: 'bg-amber-500', chip: 'bg-amber-100 text-amber-800', label: 'Warning' },
  info: { bar: 'bg-sky-500', chip: 'bg-sky-100 text-sky-700', label: 'Info' },
};

/** Headline sentence, e.g. "35% shortfall risk next week due to ...". */
function headline(risk, weather) {
  const pct = Math.round(risk.projected_shortfall_pct);
  const days = risk.weather_summary?.horizon_days ?? 7;
  const window = days === 1 ? 'tomorrow' : `over the next ${days} days`;

  const causes = [];
  if (risk.weather_index > 0.15) {
    causes.push(
      `forecast rainfall peaking at ${risk.weather_summary?.peak_daily_rainfall_mm} mm/day`,
    );
  }
  const down = risk.equipment_summary?.down ?? 0;
  const maint = risk.equipment_summary?.maintenance ?? 0;
  if (down > 0) causes.push(`${down} machine${down === 1 ? '' : 's'} out of service`);
  else if (maint > 0) causes.push(`${maint} machine${maint === 1 ? '' : 's'} in maintenance`);

  const causeText = causes.length ? ` due to ${causes.join(' and ')}` : ' on current fleet and weather';
  return `${pct}% production shortfall risk ${window}${causeText}.`;
}

export default function BottleneckAlerts({ risk, weather, onRefresh, refreshing }) {
  if (!risk) return null;

  const tone = RISK_COLORS[risk.risk_level] ?? RISK_COLORS.moderate;
  const bottlenecks = risk.bottlenecks ?? [];

  return (
    <div className={`rounded-xl border ${tone.border} ${tone.bg} p-5`}>
      {/* Headline */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${tone.text} ${tone.bg} border ${tone.border}`}>
              {tone.label}
            </span>
            <span className="text-xs text-slate-500">
              confidence {Math.round((risk.confidence_score ?? 0) * 100)}%
            </span>
            {weather?.source === 'synthetic' && (
              <span className="rounded bg-white/70 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                synthetic weather
              </span>
            )}
          </div>

          <p className="mt-2 text-sm font-semibold leading-snug text-slate-800">
            {headline(risk, weather)}
          </p>
          <p className="mt-1 text-xs text-slate-600">
            Projected output {risk.projected_shortfall_tonnes} t below target per day
            {risk.unmitigated_shortfall_pct > risk.projected_shortfall_pct && (
              <> · unmitigated {Math.round(risk.unmitigated_shortfall_pct)}%</>
            )}
          </p>
        </div>

        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {refreshing ? 'Refreshing...' : 'Refresh forecast'}
          </button>
        )}
      </div>

      {/* Ranked risks */}
      {bottlenecks.length === 0 ? (
        <p className="mt-4 text-sm text-slate-600">
          No bottlenecks detected in the forecast window.
        </p>
      ) : (
        <ul className="mt-4 space-y-2.5">
          {bottlenecks.map((b) => {
            const sev = SEVERITY[b.severity] ?? SEVERITY.info;
            return (
              <li key={b.code} className="flex gap-3 rounded-lg bg-white/70 p-3">
                <span className={`mt-0.5 w-1 shrink-0 self-stretch rounded-full ${sev.bar}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-slate-800">{b.title}</p>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${sev.chip}`}>
                      {sev.label}
                    </span>
                    {b.impact_pct > 0 && (
                      <span className="text-[11px] text-slate-500">
                        ~{b.impact_pct.toFixed(1)}pp impact
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600">{b.detail}</p>
                  {b.recommendation && (
                    <p className="mt-1 text-xs font-medium text-brand-700">
                      → {b.recommendation}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
