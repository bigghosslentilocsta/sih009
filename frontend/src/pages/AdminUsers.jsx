/**
 * Admin user-management panel (administrator role only).
 * Create accounts, assign roles, deactivate users and reset passwords.
 */

import { useCallback, useEffect, useState } from 'react';

import CreateUserForm from '../components/admin/CreateUserForm.jsx';
import UserTable from '../components/admin/UserTable.jsx';
import Alert from '../components/ui/Alert.jsx';
import Button from '../components/ui/Button.jsx';
import api from '../lib/apiClient.js';
import { ROLES, ROLE_LABELS } from '../lib/roles.js';
import { useAuth } from '../context/AuthContext.jsx';

const ROLE_OPTIONS = ['', ROLES.GEOLOGIST, ROLES.OPERATIONS_MANAGER, ROLES.EXECUTIVE, ROLES.ADMIN];

export default function AdminUsers() {
  const { user: currentUser } = useAuth();

  const [users, setUsers] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [banner, setBanner] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/admin/users', { params: { search, role, page, limit: 10 } });
      setUsers(data.items);
      setPagination(data.pagination);
    } catch (err) {
      setBanner({ tone: 'error', text: err.userMessage });
    } finally {
      setLoading(false);
    }
  }, [search, role, page]);

  useEffect(() => {
    // Debounce so typing in the search box does not fire a request per keystroke.
    const timer = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  /** Run a mutating admin action with consistent loading + feedback. */
  const runAction = useCallback(
    async (target, action, successMessage) => {
      setBusyId(target.id);
      try {
        await action();
        setBanner({ tone: 'success', text: successMessage(target) });
        await load();
      } catch (err) {
        setBanner({ tone: 'error', text: err.userMessage });
      } finally {
        setBusyId(null);
      }
    },
    [load],
  );

  const changeRole = (target, newRole) =>
    runAction(
      target,
      () => api.patch(`/admin/users/${target.id}`, { role: newRole }),
      (t) => `${t.fullName} is now a ${ROLE_LABELS[newRole]}.`,
    );

  const toggleActive = (target) =>
    runAction(
      target,
      () => api.delete(`/admin/users/${target.id}`),
      (t) => `${t.fullName} has been deactivated.`,
    );

  const reactivate = (target) =>
    runAction(
      target,
      () => api.patch(`/admin/users/${target.id}`, { isActive: true }),
      (t) => `${t.fullName} has been reactivated.`,
    );

  async function resetPassword(target) {
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Reset the password for ${target.fullName}?`)) return;
    setBusyId(target.id);
    try {
      const { data } = await api.post(`/admin/users/${target.id}/reset-password`);
      // The temporary password is shown exactly once - copy it now.
      window.prompt(`Temporary password for ${target.email} (shown once):`, data.temporaryPassword);
      setBanner({ tone: 'success', text: 'Password reset. Share it securely.' });
    } catch (err) {
      setBanner({ tone: 'error', text: err.userMessage });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">User Management</h2>
          <p className="text-sm text-slate-500">
            {pagination.total} account{pagination.total === 1 ? '' : 's'} · create accounts and
            assign platform roles
          </p>
        </div>
        <Button onClick={() => setShowCreate((open) => !open)}>
          {showCreate ? 'Close form' : '+ Create user'}
        </Button>
      </div>

      {banner && (
        <Alert tone={banner.tone} onDismiss={() => setBanner(null)}>
          {banner.text}
        </Alert>
      )}

      {showCreate && (
        <CreateUserForm
          onCreated={() => {
            setShowCreate(false);
            setPage(1);
            load();
          }}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {/* Filters */}
      <div className="card flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1">
          <label htmlFor="search" className="mb-1.5 block text-sm font-medium text-slate-700">
            Search
          </label>
          <input
            id="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Name or email..."
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
          />
        </div>
        <div className="w-56">
          <label htmlFor="roleFilter" className="mb-1.5 block text-sm font-medium text-slate-700">
            Role
          </label>
          <select
            id="roleFilter"
            value={role}
            onChange={(e) => {
              setRole(e.target.value);
              setPage(1);
            }}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
          >
            {ROLE_OPTIONS.map((option) => (
              <option key={option || 'all'} value={option}>
                {option === '' ? 'All roles' : ROLE_LABELS[option]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Users */}
      <div className="card overflow-x-auto p-0">
        <UserTable
          users={users}
          loading={loading}
          busyId={busyId}
          currentUserId={currentUser?.id}
          onChangeRole={changeRole}
          onToggleActive={toggleActive}
          onReactivate={reactivate}
          onResetPassword={resetPassword}
        />
      </div>

      {/* Pagination */}
      {pagination.pages > 1 && (
        <div className="flex items-center justify-between text-sm text-slate-600">
          <span>
            Page {pagination.page} of {pagination.pages}
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={pagination.page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={pagination.page >= pagination.pages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
