/**
 * Route table.
 *
 * Access model (enforced twice - here for UX, and on the API for real security):
 *   admin              -> everything
 *   geologist          -> Map (Module A), Settings
 *   operations_manager -> Dashboard (Module B), Settings
 *   executive          -> Executive summary (Module C), Settings
 * Settings is available to every role.
 */

import { Navigate, Route, Routes } from 'react-router-dom';

import ProtectedRoute from './components/auth/ProtectedRoute.jsx';
import AppLayout from './components/layout/AppLayout.jsx';
import { useAuth } from './context/AuthContext.jsx';
import { ROLES } from './lib/roles.js';
import AdminUsers from './pages/AdminUsers.jsx';
import Executive from './pages/Executive.jsx';
import Login from './pages/Login.jsx';
import MapPage from './pages/MapPage.jsx';
import OperationsDashboard from './pages/OperationsDashboard.jsx';
import Placeholder from './pages/Placeholder.jsx';
import Settings from './pages/Settings.jsx';

const { ADMIN, GEOLOGIST, OPERATIONS_MANAGER, EXECUTIVE } = ROLES;

/** Send the signed-in user to their role's landing page. */
function RoleHomeRedirect() {
  const { home } = useAuth();
  return <Navigate to={home} replace />;
}

/** Public route: bounce away if a session already exists. */
function PublicOnly({ children }) {
  const { isAuthenticated, isLoading, home } = useAuth();
  if (isLoading) return null;
  if (isAuthenticated) return <Navigate to={home} replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicOnly>
            <Login />
          </PublicOnly>
        }
      />

      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<RoleHomeRedirect />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute roles={[OPERATIONS_MANAGER, ADMIN]}>
              <OperationsDashboard />
            </ProtectedRoute>
          }
        />
        {/* Alias so /operations also resolves to the same dashboard. */}
        <Route
          path="/operations"
          element={
            <ProtectedRoute roles={[OPERATIONS_MANAGER, ADMIN]}>
              <OperationsDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/map"
          element={
            <ProtectedRoute roles={[GEOLOGIST, ADMIN]}>
              <MapPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/executive"
          element={
            <ProtectedRoute roles={[EXECUTIVE, ADMIN]}>
              <Executive />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute roles={[ADMIN]}>
              <AdminUsers />
            </ProtectedRoute>
          }
        />
        {/* Every role can reach their own settings. */}
        <Route path="/settings" element={<Settings />} />
        <Route
          path="/reserves"
          element={
            <Placeholder title="Reserve Inventory" detail="Manganese block inventory lands here." />
          }
        />
        <Route
          path="/forecast"
          element={
            <Placeholder
              title="Shortfall Forecast"
              detail="Production vs. demand projection lands here."
            />
          }
        />
        <Route
          path="*"
          element={<Placeholder title="Not Found" detail="That route does not exist." />}
        />
      </Route>
    </Routes>
  );
}
