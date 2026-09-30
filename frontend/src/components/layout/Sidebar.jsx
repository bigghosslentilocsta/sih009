/**
 * Role-aware navigation sidebar.
 * Only modules the signed-in user can actually reach are listed, so nobody is
 * offered a link that would bounce them to "Access denied".
 */

import { NavLink, useNavigate } from 'react-router-dom';

import { useAuth } from '../../context/AuthContext.jsx';
import { ROLES, initialsOf } from '../../lib/roles.js';

const NAV_ITEMS = [
  {
    to: '/admin',
    label: 'User Management',
    roles: [ROLES.ADMIN],
    icon: <path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-4.42 0-8 2.24-8 5v1h16v-1c0-2.76-3.58-5-8-5Z" />,
  },
  {
    to: '/map',
    label: 'Reserve Map',
    roles: [ROLES.GEOLOGIST, ROLES.ADMIN],
    icon: <path d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z" />,
  },
  {
    to: '/dashboard',
    label: 'Operations',
    roles: [ROLES.OPERATIONS_MANAGER, ROLES.ADMIN],
    icon: <path d="M3 13h8V3H3v10Zm0 8h8v-6H3v6Zm10 0h8V11h-8v10Zm0-18v6h8V3h-8Z" />,
  },
  {
    to: '/executive',
    label: 'Executive',
    roles: [ROLES.EXECUTIVE, ROLES.ADMIN],
    icon: <path d="M3.5 18.49 9 12.99l4 4L21 8.92 19.59 7.5l-6.59 6.59-4-4L2 16.99l1.5 1.5Z" />,
  },
  {
    to: '/settings',
    label: 'Settings',
    roles: null, // every role
    icon: <path d="M12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5Z" />,
  },
];

function Icon({ children }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="currentColor" aria-hidden="true">
      {children}
    </svg>
  );
}

export default function Sidebar({ isOpen, onClose }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // Only surface modules this role can actually reach.
  const items = NAV_ITEMS.filter((item) => item.roles === null || item.roles.includes(user?.role));

  function handleSignOut() {
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/50 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-surface text-slate-200 transition-transform duration-200 lg:static lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand */}
        <div className="flex h-16 items-center gap-3 border-b border-white/10 px-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500 text-sm font-bold">
            Mn
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold text-white">SIH 26009</p>
            <p className="text-[11px] text-slate-400">Manganese Intelligence</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-brand-500 text-white'
                    : 'text-slate-300 hover:bg-white/10 hover:text-white'
                }`
              }
            >
              <Icon>{item.icon}</Icon>
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Signed-in user + sign out */}
        <div className="border-t border-white/10 p-3">
          <div className="mb-2 flex items-center gap-3 px-2 py-1.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-semibold text-white">
              {initialsOf(user?.fullName)}
            </span>
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-medium text-white">{user?.fullName}</p>
              <p className="truncate text-[11px] capitalize text-slate-400">
                {user?.role?.replace(/_/g, ' ')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
          >
            Sign out
          </button>
        </div>
      </aside>
    </>
  );
}
