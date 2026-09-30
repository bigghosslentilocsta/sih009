/**
 * Interactive Scenario Simulator.
 *
 * Sliders recompute the projection locally using `risk.model_coefficients`
 * from the API, so the chart updates instantly on every drag instead of
 * issuing a request per movement.
 */

import Button from '../ui/Button.jsx';
import { RISK_COLORS } from '../../lib/operations.js';

const LEVERS = [
  {
    key: 'covered_pit_fraction',
    label: 'Move extraction to covered pits',
    hint: 'Shifts the weather-sensitive share of output indoors.',
  },
  {
    key: 'labor_shift_fraction',
    label: 'Shift / add labour',
    hint: 'Overtime and redeployment to the affected sectors.',
  },
  {
    key: 'maintenance_acceleration',
    label: 'Accelerate maintenance',
    hint: 'Brings scheduled services forward, cutting failure risk.',
  },
  {
    key: 'fleet_surge_fraction',
    label: 'Hire spare fleet',
    hint: 'Temporary equipment to cover units out of service.',
  },
];

function Slider({ lever, value, onChange, disabled }) {
  const pct = Math.round(value * 100);
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <label htmlFor={lever.key} className="text-sm font-medium text-slate-700">
          {lever.label}
        </label>
        <span className="font-mono text-xs font-semibold text-slate-600">{pct}%</span>
      </div>
      <input
        id={lever.key}
        type="range"
        min="0"
        max="1"
        step="0.05"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(lever.key, Number(e.target.value))}
        className="w-full accent-brand-500 disabled:opacity-50"
      />
      <p className="mt-0.5 text-[11px] text-slate-400">{lever.hint}</p>
    </div>
  );
}

export default function ScenarioSimulator({
  scenario,
  onChange,
  projection,
  risk,
  onApply,
  applying,
  disabled,
}) {
  if (!risk) return null;

  const tone = RISK_COLORS[risk.risk_level] ?? RISK_COLORS.moderate;
  const isDirty = LEVERS.some((l) => scenario[l.key] > 0);
  const hasProjection = projection != null;

  return (
    <div className="card space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-800">Scenario Simulator</h3>
        <p className="text-xs text-slate-500">
          Model mitigations and see the projected shortfall update live.
        </p>
      </div>

      {LEVERS.map((lever) => (
        <Slider
          key={lever.key}
          lever={lever}
          value={scenario[lever.key] ?? 0}
          onChange={onChange}
          disabled={disabled}
        />
      ))}

      {hasProjection && (
        <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-slate-600">Unmitigated</span>
            <span className="font-mono text-sm font-semibold text-slate-700">
              {projection.unmitigated.toFixed(1)}%
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-slate-600">With scenario</span>
            <span className={`font-mono text-lg font-bold ${projection.projected > 25 ? 'text-orange-600' : projection.projected > 10 ? 'text-amber-600' : 'text-emerald-600'}`}>
              {projection.projected.toFixed(1)}%
            </span>
          </div>
          <div className="flex items-baseline justify-between border-t border-slate-200 pt-2">
            <span className="text-xs font-medium text-slate-700">Improvement</span>
            <span
              className={`font-mono text-sm font-bold ${
                projection.improvement > 0.05 ? 'text-emerald-600' : 'text-slate-400'
              }`}
            >
              {projection.improvement > 0.05
                ? `−${projection.improvement.toFixed(1)} pp`
                : 'no change'}
            </span>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          className="flex-1"
          disabled={!isDirty || disabled}
          onClick={() =>
            LEVERS.forEach((l) => onChange(l.key, 0))
          }
        >
          Reset
        </Button>
        <Button
          size="sm"
          className="flex-1"
          disabled={!isDirty || applying || disabled}
          onClick={onApply}
        >
          {applying ? 'Applying...' : 'Apply scenario'}
        </Button>
      </div>

      {!isDirty && (
        <p className="text-center text-[11px] text-slate-400">
          Move a slider to model a mitigation.
        </p>
      )}
    </div>
  );
}
