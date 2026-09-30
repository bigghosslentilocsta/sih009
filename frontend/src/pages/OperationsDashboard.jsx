/**
 * Module B - Operations Dashboard (operations_manager / admin).
 *
 * Target vs. actual production, equipment uptime, the AI bottleneck alerts and
 * a live scenario simulator. The simulator recomputes locally from the
 * coefficients the API returns, so the charts react instantly to the sliders.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import BottleneckAlerts from '../components/operations/BottleneckAlerts.jsx';
import EquipmentUptimeChart, {
  FleetStatusDonut,
} from '../components/operations/EquipmentUptimeChart.jsx';
import ProductionTrendChart from '../components/operations/ProductionTrendChart.jsx';
import ScenarioSimulator from '../components/operations/ScenarioSimulator.jsx';
import Alert from '../components/ui/Alert.jsx';
import Button from '../components/ui/Button.jsx';
import {
  EMPTY_SCENARIO,
  applyScenario,
  getForecast,
  projectDaily,
  projectShortfall,
} from '../lib/operations.js';

const AXIS = { fontSize: 12, fill: '#64748b' };

function Kpi({ label, value, unit, sub, tone = 'text-slate-800' }) {
  return (
    <div className="card">
      <p className="card-title">{label}</p>
      <p className={`mt-2 text-3xl font-bold ${tone}`}>
        {value}
        {unit && <span className="ml-1 text-sm font-medium text-slate-500">{unit}</span>}
      </p>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

/** Forecast rainfall alongside the projected shortfall. */
function ForecastChart({ daily }) {
  if (!daily?.length) return null;
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={daily} margin={{ top: 5, right: 12, left: -12, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="date" tick={AXIS} stroke="#cbd5e1" tickFormatter={(v) => v.slice(5)} />
          <YAxis yAxisId="mm" tick={AXIS} stroke="#cbd5e1" unit=" mm" />
          <YAxis
            yAxisId="pct"
            orientation="right"
            tick={AXIS}
            stroke="#cbd5e1"
            unit="%"
          />
          <Tooltip
            contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
            formatter={(value, name) =>
              name === 'Rainfall' ? [`${value} mm`, name] : [`${Number(value).toFixed(1)}%`, name]
            }
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar yAxisId="mm" dataKey="rainfall_mm" name="Rainfall" radius={[3, 3, 0, 0]}>
            {daily.map((d, i) => (
              <Cell
                key={i}
                fill={d.rainfall_mm >= 25 ? '#dc2626' : d.rainfall_mm >= 7.5 ? '#f59e0b' : '#93c5fd'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function OperationsDashboard() {
  const [forecast, setForecast] = useState(null);
  const [scenario, setScenario] = useState(EMPTY_SCENARIO);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [horizon, setHorizon] = useState(7);

  const load = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const { data } = await getForecast({ horizon_days: horizon });
      setForecast(data);
    } catch (err) {
      setError(err.userMessage ?? 'Could not load the operations forecast.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [horizon]);

  useEffect(() => {
    load();
  }, [load]);

  const risk = forecast?.risk ?? null;
  const coefficients = risk?.model_coefficients ?? null;

  // Live re-projection as the sliders move - no network round-trip.
  const projection = useMemo(() => {
    if (!risk) return null;
    return projectShortfall(coefficients, {
      weatherIndex: risk.weather_index,
      equipmentPressure: risk.equipment_pressure,
      scenario,
    });
  }, [risk, coefficients, scenario]);

  const projectedDaily = useMemo(() => {
    if (!risk) return [];
    return projectDaily(risk.daily_projection, coefficients, {
      equipmentPressure: risk.equipment_pressure,
      scenario,
    });
  }, [risk, coefficients, scenario]);

  const handleSlider = useCallback((key, value) => {
    setScenario((s) => ({ ...s, [key]: value }));
    setNotice(null);
  }, []);

  async function handleApply() {
    setApplying(true);
    setError(null);
    try {
      const { data } = await applyScenario(scenario, { horizon_days: horizon });
      setForecast(data);
      setNotice(
        `Scenario applied by ${data.requested_by?.name ?? 'you'}: projected shortfall now ` +
          `${data.risk.projected_shortfall_pct}% (was ${risk?.unmitigated_shortfall_pct}%).`,
      );
    } catch (err) {
      setError(err.userMessage ?? 'Could not apply the scenario.');
    } finally {
      setApplying(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[24rem] flex-col items-center justify-center">
        <div className="mb-3 h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-brand-500" />
        <p className="text-sm text-slate-600">Loading operations forecast...</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">Operations Dashboard</h2>
          <p className="text-sm text-slate-500">
            {forecast?.weather?.location?.name ?? 'Mine'} production, fleet health and
            7-day shortfall forecast
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="horizon" className="text-sm text-slate-600">
            Horizon
          </label>
          <select
            id="horizon"
            value={horizon}
            onChange={(e) => setHorizon(Number(e.target.value))}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-brand-500"
          >
            {[3, 5, 7, 10, 14].map((d) => (
              <option key={d} value={d}>
                {d} days
              </option>
            ))}
          </select>
          <Button size="sm" variant="secondary" onClick={load} loading={refreshing}>
            Refresh
          </Button>
        </div>
      </div>

      {error && <Alert tone="error" title="Operations data unavailable" onDismiss={() => setError(null)}>{error}</Alert>}
      {notice && <Alert tone="success" onDismiss={() => setNotice(null)}>{notice}</Alert>}

      {/* AI bottleneck alerts */}
      <BottleneckAlerts
        risk={risk}
        weather={forecast?.weather}
        onRefresh={load}
        refreshing={refreshing}
      />

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Projected shortfall"
          value={(projection?.projected ?? risk?.projected_shortfall_pct ?? 0).toFixed(1)}
          unit="%"
          sub={`${risk?.projected_shortfall_tonnes ?? 0} t/day below target`}
          tone={
            (projection?.projected ?? 0) > 25
              ? 'text-rose-600'
              : (projection?.projected ?? 0) > 10
                ? 'text-amber-600'
                : 'text-emerald-600'
          }
        />
        <Kpi
          label="Historical attainment"
          value={forecast?.performance?.attainment_pct ?? 0}
          unit="%"
          sub={`${forecast?.performance?.record_count ?? 0} shifts recorded`}
        />
        <Kpi
          label="Fleet availability"
          value={risk?.equipment_summary?.availability_pct ?? 0}
          unit="%"
          sub={`${risk?.equipment_summary?.down ?? 0} down · ${risk?.equipment_summary?.maintenance ?? 0} in maintenance`}
        />
        <Kpi
          label="Peak rainfall"
          value={risk?.weather_summary?.peak_daily_rainfall_mm ?? 0}
          unit="mm/day"
          sub={`${risk?.weather_summary?.heavy_rain_days ?? 0} heavy-rain day(s) forecast`}
        />
      </div>

      {/* Charts + simulator */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="card xl:col-span-2">
          <h3 className="card-title mb-3">Target vs. Actual Production</h3>
          <ProductionTrendChart data={forecast?.performance?.daily ?? []} />
        </div>

        <ScenarioSimulator
          scenario={scenario}
          onChange={handleSlider}
          projection={projection}
          risk={risk}
          onApply={handleApply}
          applying={applying}
          disabled={loading}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="card xl:col-span-2">
          <h3 className="card-title mb-3">Equipment Uptime vs. Downtime</h3>
          <EquipmentUptimeChart machines={forecast?.equipment ?? []} />
        </div>
        <div className="card">
          <h3 className="card-title mb-3">Fleet by Status</h3>
          <FleetStatusDonut summary={risk?.equipment_summary} />
        </div>
      </div>

      {/* Forecast */}
      <div className="card">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="card-title">Forecast Rainfall vs. Projected Shortfall</h3>
          <p className="text-xs text-slate-500">
            Bars = daily rainfall · line = shortfall under the current scenario
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ForecastChart daily={projectedDaily} />
          <div>
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="py-2 font-semibold">Date</th>
                  <th className="py-2 font-semibold">Rain</th>
                  <th className="py-2 font-semibold">Target</th>
                  <th className="py-2 font-semibold">Projected</th>
                  <th className="py-2 text-right font-semibold">Shortfall</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {projectedDaily.map((d) => (
                  <tr key={d.date}>
                    <td className="py-1.5 text-slate-700">{d.date}</td>
                    <td className="py-1.5 text-slate-600">{d.rainfall_mm} mm</td>
                    <td className="py-1.5 text-slate-600">{d.target_tonnes} t</td>
                    <td className="py-1.5 font-medium text-slate-800">{d.projected_tonnes} t</td>
                    <td
                      className={`py-1.5 text-right font-mono font-semibold ${
                        d.projected_shortfall_pct > 25
                          ? 'text-rose-600'
                          : d.projected_shortfall_pct > 10
                            ? 'text-amber-600'
                            : 'text-emerald-600'
                      }`}
                    >
                      {d.projected_shortfall_pct.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
