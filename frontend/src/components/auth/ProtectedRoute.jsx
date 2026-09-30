/**
 * Route guard.
 *
 *   <ProtectedRoute>...</ProtectedRoute>              any signed-in user
 *   <ProtectedRoute roles={[ROLES.ADMIN]}>...</...>    specific roles only
 *
 * While the session is being revalidated it renders a spinner rather than
 * bouncing the user to /login, which would cause a redirect flash on refresh.
 */

import { Navigate, useLocation } from 'react-router-dom';

import { useAuth } from '../../context/AuthContext.jsx';
import { ROLE_HOME, ROLE_LABELS } from '../../lib/roles.js';

function FullScreenSpinner() {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-slate-100">
      <div className="flex flex-col items-center gap-3">
        <div className="h-9 w-9 animate-spin rounded-full border-4 border-slate-300 border-t-brand-500" />
        <p className="text-sm text-slate-500">Restoring your session...</p>
      </div>
    </div>
  );
}

export default function ProtectedRoute({ roles = [], children }) {
  const { user, isLoading, isAuthenticated } = useAuth();
  const location = useLocation();

  if (isLoading) return <FullScreenSpinner />;

  if (!isAuthenticated) {
    // Remember where they were headed so login can bounce them back.
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (roles.length > 0 && !roles.includes(user.role)) {
    return (
      <div className="flex min-h-[24rem] flex-col items-center justify-center text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-100 text-2xl">
          <span aria-hidden="true">⛔</span>
        </div>
        <h2 className="text-xl font-semibold text-slate-800">Access denied</h2>
        <p className="mt-2 max-w-md text-sm text-slate-500">
          Your role (<strong>{ROLE_LABELS[user.role] ?? user.role}</strong>) does not have
          permission to view this page.
        </p>
        <a
          href={ROLE_HOME[user.role] ?? '/dashboard'}
          className="mt-5 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
        >
          Go to my dashboard
        </a>
      </div>
    );
  }

  return children;
}
