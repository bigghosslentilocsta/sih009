import { useState } from 'react';
import { Outlet } from 'react-router-dom';

import Sidebar from './Sidebar.jsx';

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-full min-h-screen bg-slate-100">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="flex h-16 shrink-0 items-center gap-4 border-b border-slate-200 bg-white px-4 lg:px-6">
          <button
            type="button"
            onClick={() => setSidebarOpen((open) => !open)}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden"
            aria-label="Toggle navigation"
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden="true">
              <path d="M3 6h18v2H3V6Zm0 5h18v2H3v-2Zm0 5h18v2H3v-2Z" />
            </svg>
          </button>

          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold text-slate-800">
              Manganese Reserve &amp; Production Analytics
            </h1>
            <p className="truncate text-xs text-slate-500">
              Reserve identification · Production shortfall prediction
            </p>
          </div>
        </header>

        {/* Routed page content */}
        <main className="min-w-0 flex-1 overflow-y-auto p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
