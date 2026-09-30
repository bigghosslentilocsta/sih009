/** Table of user accounts with inline role and status controls. */

import Button from '../ui/Button.jsx';
import { ROLES, ROLE_BADGE, ROLE_LABELS, initialsOf } from '../../lib/roles.js';

function RoleBadge({ role }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
        ROLE_BADGE[role] ?? 'bg-slate-100 text-slate-700'
      }`}
    >
      {ROLE_LABELS[role] ?? role}
    </span>
  );
}

function formatDate(value) {
  if (!value) return 'Never';
  return new Date(value).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export default function UserTable({
  users,
  loading,
  busyId,
  currentUserId,
  onChangeRole,
  onToggleActive,
  onReactivate,
  onResetPassword,
}) {
  if (loading) {
    return <p className="px-5 py-10 text-center text-sm text-slate-400">Loading users...</p>;
  }

  if (users.length === 0) {
    return <p className="px-5 py-10 text-center text-sm text-slate-400">No users match your filters.</p>;
  }

  return (
    <table className="w-full min-w-[46rem] text-left text-sm">
      <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
        <tr>
          <th className="px-5 py-3 font-semibold">User</th>
          <th className="px-5 py-3 font-semibold">Role</th>
          <th className="px-5 py-3 font-semibold">Status</th>
          <th className="px-5 py-3 font-semibold">Last login</th>
          <th className="px-5 py-3 text-right font-semibold">Actions</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {users.map((u) => {
          const isSelf = u.id === currentUserId;
          const busy = busyId === u.id;
          return (
            <tr key={u.id} className={u.isActive ? '' : 'bg-slate-50 opacity-70'}>
              <td className="px-5 py-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-500/10 text-xs font-semibold text-brand-600">
                    {initialsOf(u.fullName)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-800">
                      {u.fullName}
                      {isSelf && <span className="ml-2 text-xs text-slate-400">(you)</span>}
                    </p>
                    <p className="truncate text-xs text-slate-500">{u.email}</p>
                  </div>
                </div>
              </td>

              <td className="px-5 py-3">
                <select
                  value={u.role}
                  disabled={busy || isSelf}
                  onChange={(e) => onChangeRole(u, e.target.value)}
                  className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs outline-none focus:border-brand-500 disabled:bg-slate-100 disabled:text-slate-500"
                >
                  {Object.values(ROLES).map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
              </td>

              <td className="px-5 py-3">
                <span
                  className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                    u.isActive
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {u.isActive ? 'Active' : 'Deactivated'}
                </span>
              </td>

              <td className="px-5 py-3 text-xs text-slate-500">{formatDate(u.lastLoginAt)}</td>

              <td className="px-5 py-3">
                <div className="flex justify-end gap-1.5">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => onResetPassword(u)}
                    title={u.role ? `Current: ${ROLE_LABELS[u.role]}` : ''}
                  >
                    Reset
                  </Button>
                  {u.isActive ? (
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={busy || isSelf}
                      onClick={() => onToggleActive(u)}
                    >
                      Disable
                    </Button>
                  ) : (
                    <Button size="sm" disabled={busy} onClick={() => onReactivate(u)}>
                      Enable
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export { RoleBadge };
