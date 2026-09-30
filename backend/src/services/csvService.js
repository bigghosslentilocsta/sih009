/**
 * CSV generation for the executive report export.
 */

/** Escape a value for CSV: quote when it contains a delimiter, quote or newline. */
const cell = (value) => {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** Build one CSV row from a list of values. */
const row = (...values) => values.map(cell).join(',');

const num = (value, digits = 1) =>
  value === null || value === undefined ? '' : Number(value).toFixed(digits);

/** Filename for the downloaded report, stamped with the generation date. */
export const csvFilename = () => {
  const stamp = new Date().toISOString().slice(0, 10);
  return `SIH26009_Executive_Report_${stamp}.csv`;
};

/**
 * Compile an executive summary into a structured, human-readable CSV.
 * Sections are separated by a blank line and a `## Section` marker so the
 * file is readable in Excel *and* parseable by a script.
 */
export function buildExecutiveCsv(summary) {
  const lines = [];
  const h = summary.headline ?? {};
  const r = summary.reserves ?? {};
  const o = summary.operations ?? {};
  const p = summary.production ?? {};
  const risk = summary.risk ?? {};

  // --- Header -----------------------------------------------------------
  lines.push(row('SIH 26009 - Executive Summary Report'));
  lines.push(row('Generated at', summary.generated_at));
  lines.push(row('Platform', 'Manganese Reserve Intelligence'));
  lines.push('');

  // --- Headline KPIs ----------------------------------------------------
  lines.push(row('## Headline KPIs'));
  lines.push(row('metric', 'value', 'unit'));
  lines.push(row('Active reserve blocks', h.active_reserve_blocks ?? '', 'blocks'));
  lines.push(row('Total identified reserve', h.total_reserve_mt ?? '', 'Mt'));
  lines.push(row('Operational health score', h.health_score ?? '', '/100'));
  lines.push(row('Health grade', h.health_grade ?? '', 'A-D'));
  lines.push(row('Monthly production fulfilment', h.fulfilment_pct ?? '', '%'));
  lines.push(row('Projected shortfall', h.projected_shortfall_pct ?? '', '%'));
  lines.push(row('Open alerts', h.open_alerts ?? 0, 'count'));
  lines.push('');

  // --- Reserve inventory ------------------------------------------------
  lines.push(row('## Reserve inventory'));
  lines.push(
    row('block_id', 'name', 'state', 'district', 'area_km2', 'reserve_tonnes',
      'contained_metal_tonnes', 'grade_pct', 'confidence', 'status', 'source', 'suitability_score'),
  );
  for (const b of r.blocks ?? []) {
    lines.push(
      row(b.block_id, b.name, b.state, b.district, num(b.area_km2, 2), b.estimated_reserve_tonnes,
        b.contained_metal_tonnes, num(b.average_grade_pct, 2), b.confidence_level, b.status,
        b.source, b.suitability_score ?? ''),
    );
  }
  lines.push(
    row('TOTAL', `${r.total_blocks ?? 0} blocks`, '', '', num(r.total_area_km2, 1),
      r.total_reserve_tonnes ?? '', r.total_contained_metal_tonnes ?? '',
      num(r.weighted_average_grade_pct, 2), '', '', '', ''),
  );
  lines.push('');

  // --- Operational health ----------------------------------------------
  lines.push(row('## Operational health'));
  lines.push(row('metric', 'value'));
  lines.push(row('Total machines', o.total_machines ?? ''));
  lines.push(row('Active', o.active ?? ''));
  lines.push(row('In maintenance', o.in_maintenance ?? ''));
  lines.push(row('Down', o.down ?? ''));
  lines.push(row('Availability %', num(o.availability_pct, 1)));
  lines.push(row('Reliability %', num(o.reliability_pct, 1)));
  lines.push(row('Maintenance compliance %', num(o.maintenance_compliance_pct, 1)));
  lines.push(row('Overdue maintenance', o.overdue_maintenance ?? ''));
  lines.push(row('Due within 7 days', o.due_soon ?? ''));
  lines.push('');

  // --- Production by month ---------------------------------------------
  lines.push(row('## Monthly production fulfilment'));
  lines.push(row('month', 'target_tonnes', 'actual_tonnes', 'fulfillment_pct', 'shortfall_tonnes', 'rainy_days'));
  for (const m of p.series ?? []) {
    lines.push(row(m.month, m.target_tonnes, m.actual_tonnes, num(m.fulfillment_pct, 1), m.shortfall_tonnes, m.rainy_days));
  }
  lines.push(
    row('TOTAL', p.total_target_tonnes ?? '', p.total_actual_tonnes ?? '',
      num(p.overall_fulfillment_pct, 1), '', ''),
  );
  lines.push('');

  // --- Forward risk -----------------------------------------------------
  lines.push(row('## Forward risk'));
  lines.push(row('metric', 'value'));
  if (risk.unavailable) {
    lines.push(row('Status', 'unavailable'));
    lines.push(row('Reason', risk.error ?? ''));
  } else {
    lines.push(row('Risk level', risk.risk_level ?? ''));
    lines.push(row('Projected shortfall %', num(risk.projected_shortfall_pct, 1)));
    lines.push(row('Unmitigated shortfall %', num(risk.unmitigated_shortfall_pct, 1)));
    lines.push(row('Weather index', num(risk.weather_index, 2)));
    lines.push(row('Equipment pressure', num(risk.equipment_pressure, 2)));
    lines.push(row('Confidence', num(risk.confidence_score, 2)));
    lines.push(row('Weather source', risk.weather_source ?? ''));
    lines.push(row('Weather location', risk.weather_location ?? ''));
  }
  lines.push('');

  // --- Alerts -----------------------------------------------------------
  lines.push(row('## Active alerts'));
  lines.push(row('severity', 'source', 'title', 'detail', 'impact_pp', 'machines', 'recommendation'));
  for (const a of summary.alerts ?? []) {
    lines.push(
      row(a.severity, a.source, a.title, a.detail,
        a.impact_pct === null || a.impact_pct === undefined ? '' : num(a.impact_pct, 1),
        (a.machines ?? []).join(' '), a.recommendation),
    );
  }
  if (!(summary.alerts ?? []).length) {
    lines.push(row('none', '', 'No active alerts', '', '', '', ''));
  }

  return lines.join('\r\n');
}
