/**
 * Module C - Executive Summary (executive / admin).
 *
 * Macro view across the platform: reserve inventory, operational health,
 * monthly fulfilment and forward risk - plus a one-click CSV report.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import Alert from '../components/ui/Alert.jsx';
import Button from '../components/ui/Button.jsx';
import { downloadExecutiveReport, getSummary } from '../lib/executive.js';

const AXIS = { fontSize: 12, fill: '#64748b' };

const healthTone = (score) =>
  score >= 85 ? 'text-emerald-600' : score >= 70 ? 'text-sky-600' : score >= 55 ? 'text-amber-600' : 'text-rose-600';

const mt = (tonnes) => (tonnes ? `${(tonnes / 1e6).toFixed(1)} Mt` : '—');

function KpiCard({ label, value, unit, sub, tone = 'text-slate-800', icon }) {
  return (
    <div className="card">
      <div className="flex items-start justify-between gap-2">
        <p className="card-title">{label}</p>
        {icon && <span className="text-lg opacity-60" aria-hidden="true">{icon}</span>}
      </div>
      <p className={`mt-2 text-3xl font-bold ${tone}`}>
        {value}
        {unit && <span className="ml-1 text-sm font-medium text-slate-500">{unit}</span>}
      </p>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

function AlertRow({ alert }) {
  const tone =
    alert.severity === 'critical'
      ? 'border-rose-200 bg-rose-50'
      : alert.severity === 'warning'
        ? 'border-amber-200 bg-amber-50'
        : 'border-sky-200 bg-sky-50';

  return (
    <li className={`rounded-lg border p-3 ${tone}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-slate-800">{alert.title}</span>
        <span className="rounded bg-white/70 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-600">
          {alert.severity}
        </span>
        {alert.impact_pct > 0 && (
          <span className="text-[11px] text-slate-500">~{alert.impact_pct.toFixed(1)}pp</span>
        )}
      </div>
      <p className="mt-1 text-xs leading-relaxed text-slate-600">{alert.detail}</p>
      {alert.recommendation && (
        <p className="mt-1 text-xs font-medium text-brand-700">→ {alert.recommendation}</p>
      )}
    </li>
  );
}

export default function Executive() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const { data } = await getSummary();
      setSummary(data);
    } catch (err) {
      setError(err.userMessage ?? 'Could not load the executive summary.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleDownload() {
    setDownloading(true);
    setError(null);
    setNotice(null);
    try {
      const filename = await downloadExecutiveReport();
      setNotice(`Downloaded ${filename}`);
    } catch (err) {
      setError(err.userMessage ?? 'Could not generate the report.');
    } finally {
      setDownloading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[24rem] flex-col items-center justify-center">
        <div className="mb-3 h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-brand-500" />
        <p className="text-sm text-slate-600">Building the executive summary...</p>
      </div>
    );
  }

  const h = summary?.headline ?? {};
  const reserves = summary?.reserves ?? {};
  const ops = summary?.operations ?? {};
  const production = summary?.production ?? {};
  const risk = summary?.risk ?? {};
  const alerts = summary?.alerts ?? [];

  // Reserve blocks, largest first, for the macro bar chart.
  const blockData = (reserves.blocks ?? []).map((b) => ({
    name: b.name.replace(' Block', ''),
    reserve: b.estimated_reserve_tonnes,
    grade: b.average_grade_pct,
  }));

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">Executive Summary</h2>
          <p className="text-sm text-slate-500">
            Enterprise view · {summary?.generated_at ? new Date(summary.generated_at).toLocaleString('en-IN') : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={load} loading={refreshing}>
            Refresh
          </Button>
          <Button onClick={handleDownload} loading={downloading} className="shadow-sm">
            {downloading ? 'Generating...' : 'Download Executive Report'}
          </Button>
        </div>
      </div>

      {error && <Alert tone="error" title="Unavailable" onDismiss={() => setError(null)}>{error}</Alert>}
      {notice && <Alert tone="success" onDismiss={() => setNotice(null)}>{notice}</Alert>}

      {/* KPI row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Identified reserve"
          value={reserves.total_reserve_mt ?? 0}
          unit="Mt"
          sub={`${h.active_reserve_blocks ?? 0} active blocks · ${mt(reserves.total_contained_metal_tonnes)} contained metal`}
          icon="⛏"
        />
        <KpiCard
          label="Operational health"
          value={ops.health_score ?? 0}
          unit={`/100 · ${ops.grade ?? '-'}`}
          sub={`${ops.availability_pct ?? 0}% fleet availability · ${ops.down ?? 0} down`}
          tone={healthTone(ops.health_score ?? 0)}
          icon="❤"
        />
        <KpiCard
          label="Monthly fulfilment"
          value={h.fulfilment_pct ?? '—'}
          unit="%"
          sub={
            production.fulfilment_trend_pp != null
              ? `${production.fulfilment_trend_pp >= 0 ? '+' : ''}${production.fulfilment_trend_pp}pp vs last month`
              : 'no prior month to compare'
          }
          tone={(h.fulfilment_pct ?? 0) >= 95 ? 'text-emerald-600' : (h.fulfilment_pct ?? 0) >= 85 ? 'text-sky-600' : 'text-amber-600'}
          icon="📈"
        />
        <KpiCard
          label="Projected shortfall"
          value={risk.projected_shortfall_pct ?? '—'}
          unit="%"
          sub={
            risk.unavailable
              ? 'risk service unavailable'
              : `${risk.risk_level ?? '-'} risk · next 7 days${risk.weather_source === 'synthetic' ? ' (synthetic weather)' : ''}`
          }
          tone={(risk.projected_shortfall_pct ?? 0) > 25 ? 'text-rose-600' : (risk.projected_shortfall_pct ?? 0) > 10 ? 'text-amber-600' : 'text-emerald-600'}
          icon="⚠"
        />
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="card">
          <div className="mb-3 flex items-baseline justify-between">
            <h3 className="card-title">Active alerts</h3>
            <span className="text-xs text-slate-500">{alerts.length} open</span>
          </div>
          <ul className="space-y-2">
            {alerts.slice(0, 5).map((a, i) => (
              <AlertRow key={`${a.source}-${i}`} alert={a} />
            ))}
          </ul>
        </div>
      )}


      {/* Macro charts */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="card">
          <h3 className="card-title mb-3">Monthly Production Fulfilment</h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={production.series ?? []}
                margin={{ top: 5, right: 12, left: -12, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="month" tick={AXIS} stroke="#cbd5e1" />
                <YAxis yAxisId="t" tick={AXIS} stroke="#cbd5e1" unit=" t" />
                <YAxis
                  yAxisId="p"
                  orientation="right"
                  domain={[0, 130]}
                  tick={AXIS}
                  stroke="#cbd5e1"
                  unit="%"
                />
                <Tooltip
                  contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
                  formatter={(value, name) =>
                    name === 'Fulfilment %' ? [`${value}%`, name] : [`${value} t`, name]
                  }
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar yAxisId="t" dataKey="target_tonnes" name="Target" fill="#cbd5e1" radius={[3, 3, 0, 0]} />
                <Bar yAxisId="t" dataKey="actual_tonnes" name="Actual" fill="#2b6cb0" radius={[3, 3, 0, 0]} />
                <Line
                  yAxisId="p"
                  type="monotone"
                  dataKey="fulfillment_pct"
                  name="Fulfilment %"
                  stroke="#a16207"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <h3 className="card-title mb-3">Reserve by Block (Mt)</h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={blockData} margin={{ top: 5, right: 12, left: -8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={AXIS}
                  stroke="#cbd5e1"
                  interval={0}
                  angle={-18}
                  textAnchor="end"
                  height={54}
                />
                <YAxis tick={AXIS} stroke="#cbd5e1" />
                <Tooltip
                  contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
                  formatter={(value, name) =>
                    name === 'Reserve'
                      ? [`${(value / 1e6).toFixed(1)} Mt`, name]
                      : [`${value}%`, name]
                  }
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="reserve" name="Reserve" radius={[4, 4, 0, 0]}>
                  {blockData.map((b) => (
                    <Cell
                      key={b.name}
                      fill={
                        (b.grade ?? 0) >= 40
                          ? '#15803d'
                          : (b.grade ?? 0) >= 35
                            ? '#2b6cb0'
                            : '#a16207'
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Health breakdown */}
      <div className="card">
        <h3 className="card-title mb-3">Operational Health Breakdown</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[
            { key: 'Availability', value: ops.components?.availability, weight: '50% weight' },
            { key: 'Reliability', value: ops.components?.reliability, weight: '30% weight' },
            { key: 'Maintenance compliance', value: ops.components?.maintenance, weight: '20% weight' },
          ].map((c) => (
            <div key={c.key}>
              <div className="mb-1 flex items-baseline justify-between">
                <span className="text-sm text-slate-700">{c.key}</span>
                <span className="font-mono text-sm font-semibold text-slate-800">
                  {c.value ?? 0}%
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(100, c.value ?? 0)}%`,
                    backgroundColor:
                      (c.value ?? 0) >= 85 ? '#16a34a' : (c.value ?? 0) >= 70 ? '#2b6cb0' : '#f59e0b',
                  }}
                />
              </div>
              <p className="mt-0.5 text-[11px] text-slate-400">{c.weight}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-slate-400">
          Health score = 50% availability + 30% reliability + 20% maintenance compliance.
          {Object.keys(reserves.provenance ?? {}).length > 0 && (
            <>
              {' '}
              Reserve figures:{' '}
              {Object.entries(reserves.provenance)
                .map(([k, v]) => `${v} ${k}`)
                .join(', ')}
              .
            </>
          )}
        </p>
      </div>

      {/* Reserve table */}
      <div className="card overflow-x-auto p-0">
        <table className="w-full min-w-[48rem] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-3 font-semibold">Block</th>
              <th className="px-5 py-3 font-semibold">Location</th>
              <th className="px-5 py-3 text-right font-semibold">Area</th>
              <th className="px-5 py-3 text-right font-semibold">Reserve</th>
              <th className="px-5 py-3 text-right font-semibold">Grade</th>
              <th className="px-5 py-3 font-semibold">Status</th>
              <th className="px-5 py-3 font-semibold">Source</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(reserves.blocks ?? []).map((b) => (
              <tr key={b.block_id}>
                <td className="px-5 py-3 font-medium text-slate-800">{b.name}</td>
                <td className="px-5 py-3 text-slate-600">
                  {b.district}, {b.state}
                </td>
                <td className="px-5 py-3 text-right text-slate-600">{b.area_km2} km²</td>
                <td className="px-5 py-3 text-right font-medium text-slate-800">
                  {mt(b.estimated_reserve_tonnes)}
                </td>
                <td className="px-5 py-3 text-right text-slate-600">{b.average_grade_pct}%</td>
                <td className="px-5 py-3">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                    {b.status}
                  </span>
                </td>
                <td className="px-5 py-3 text-xs text-slate-500">{b.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

