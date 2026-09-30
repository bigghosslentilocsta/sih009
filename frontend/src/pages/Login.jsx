import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';

import Alert from '../components/ui/Alert.jsx';
import Button from '../components/ui/Button.jsx';
import Field from '../components/ui/Field.jsx';
import { useAuth } from '../context/AuthContext.jsx';

export default function Login() {
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Already signed in -> skip the form.
  if (isAuthenticated) {
    return <Navigate to={location.state?.from ?? '/'} replace />;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { home } = await login({ email: email.trim(), password });
      navigate(home, { replace: true });
    } catch (err) {
      setError(err.userMessage ?? 'Sign in failed.');
      setPassword('');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
      <div className="w-full max-w-md">
        {/* Brand */}
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500 text-lg font-bold text-white shadow-sm">
            Mn
          </div>
          <h1 className="text-xl font-semibold text-slate-800">SIH 26009</h1>
          <p className="text-sm text-slate-500">Manganese Reserve Intelligence Platform</p>
        </div>

        {/* Card */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-slate-800">Sign in</h2>
          <p className="mt-1 text-sm text-slate-500">
            Use your MOIL account. Contact an administrator if you need access.
          </p>

          {error && (
            <div className="mt-4">
              <Alert tone="error" onDismiss={() => setError(null)}>
                {error}
              </Alert>
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <Field
              id="email"
              label="Email address"
              type="email"
              autoComplete="username"
              placeholder="you@moil.gov.in"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
            <Field
              id="password"
              label="Password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />

            <Button type="submit" loading={submitting} className="w-full">
              {submitting ? 'Signing in...' : 'Sign in'}
            </Button>
          </form>
        </div>

        <p className="mt-4 text-center text-xs text-slate-400">
          Access is restricted to authorised MOIL personnel. All sign-in attempts are logged.
        </p>
      </div>
    </div>
  );
}
