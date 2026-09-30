/** Equipment uptime vs. downtime, by machine and by class. */

import {
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { STATUS_COLORS } from '../../lib/operations.js';

const AXIS = { fontSize: 12, fill: '#64748b' };

const STATUS_LABEL = { active: 'Available', maintenance: 'Maintenance', down: 'Down' };

/** Right-hand donut: fleet split by status. */
export function FleetStatusDonut({ summary, height = 200 }) {
  const data = Object.entries(summary?.by_status ?? {}).map(([status, value]) => ({
    name: STATUS_LABEL[status] ?? status,
    value,
    color: STATUS_COLORS[status] ?? '#94a3b8',
  }));

  if (!data.length) return <p className="py-10 text-center text-sm text-slate-400">No fleet data.</p>;

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius="55%"
            outerRadius="80%"
            paddingAngle={2}
            stroke="none"
          >
            {data.map((entry) => (
              <Cell key={entry.name} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
            formatter={(value, name) => [`${value} machines`, name]}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Left-hand bar chart: available vs. out-of-service hours per machine class. */
export default function EquipmentUptimeChart({ machines = [], height = 280 }) {
  const rows = machines.filter((m) => m.status !== 'active' || m.downtime_hours > 0);

  if (!rows.length) {
    return <p className="py-10 text-center text-sm text-slate-400">No downtime recorded.</p>;
  }

  // Uptime vs downtime in hours for the machines that are not fully available.
  const data = rows.map((m) => {
    const downtime = m.downtime_hours ?? 0;
    return {
      machine_id: m.machine_id,
      type: m.type,
      downtime,
      // A week of shifts is the reference window.
      available: Math.max(0, 168 - downtime),
      status: m.status,
    };
  });

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 5, right: 16, left: 8, bottom: 0 }}>
          <XAxis type="number" tick={AXIS} stroke="#cbd5e1" unit=" h" />
          <YAxis type="category" dataKey="machine_id" tick={AXIS} stroke="#cbd5e1" width={70} />
          <Tooltip
            contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
            formatter={(value, name) => [`${value} h`, name]}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="available" name="Available hours" stackId="h" fill="#16a34a" radius={[0, 0, 0, 0]} />
          <Bar
            dataKey="downtime"
            name="Downtime hours"
            stackId="h"
            fill="#dc2626"
            radius={[0, 4, 4, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
