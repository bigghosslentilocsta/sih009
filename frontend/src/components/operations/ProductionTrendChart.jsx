/** Target vs. actual production over time, with the attainment overlay. */

import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const AXIS = { fontSize: 12, fill: '#64748b' };

const shortDate = (iso) => {
  const d = new Date(iso);
  return `${d.getDate()}/${d.getMonth() + 1}`;
};

export default function ProductionTrendChart({ data = [], height = 280 }) {
  if (!data.length) {
    return <p className="py-10 text-center text-sm text-slate-400">No production history yet.</p>;
  }

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 5, right: 12, left: -12, bottom: 0 }}>
          <defs>
            <linearGradient id="actualFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2b6cb0" stopOpacity={0.45} />
              <stop offset="100%" stopColor="#2b6cb0" stopOpacity={0.05} />
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={shortDate}
            tick={AXIS}
            stroke="#cbd5e1"
            minTickGap={24}
          />
          <YAxis yAxisId="t" tick={AXIS} stroke="#cbd5e1" unit=" t" />
          <YAxis
            yAxisId="pct"
            orientation="right"
            domain={[0, 130]}
            tick={AXIS}
            stroke="#cbd5e1"
            unit="%"
          />
          <Tooltip
            contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
            labelFormatter={(value) => new Date(value).toDateString()}
            formatter={(value, name) =>
              name === 'Attainment %' ? [`${value}%`, name] : [`${value} t`, name]
            }
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />

          <Bar
            yAxisId="t"
            dataKey="target"
            name="Target"
            fill="#cbd5e1"
            radius={[3, 3, 0, 0]}
            barSize={10}
          />
          <Area
            yAxisId="t"
            type="monotone"
            dataKey="actual"
            name="Actual"
            stroke="#2b6cb0"
            strokeWidth={2}
            fill="url(#actualFill)"
          />
          <Line
            yAxisId="pct"
            type="monotone"
            dataKey="attainment"
            name="Attainment %"
            stroke="#a16207"
            strokeWidth={2}
            strokeDasharray="4 3"
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
