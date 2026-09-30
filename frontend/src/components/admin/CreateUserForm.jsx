/** Panel for an administrator to create a new account and assign its role. */

import { useState } from 'react';

import api from '../../lib/apiClient.js';
import { ASSIGNABLE_ROLES, ROLE_DESCRIPTIONS, ROLE_LABELS } from '../../lib/roles.js';
import Alert from '../ui/Alert.jsx';
import Button from '../ui/Button.jsx';
import Field from '../ui/Field.jsx';

const EMPTY = { fullName: '', email: '', password: '', role: ASSIGNABLE_ROLES[0], designation: '', phone: '' };

export default function CreateUserForm({ onCreated, onCancel }) {
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [banner, setBanner] = useState(null);
  const [saving, setSaving] = useState(false);

  const set = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.value }));

  async function handleSubmit(event) {
    event.preventDefault();
    setErrors({});
    setBanner(null);
    setSaving(true);
    try {
      const { data } = await api.post('/admin/users', form);
      setBanner({ tone: 'success', text: `Account created for ${data.user.email}.` });
      setForm(EMPTY);
      onCreated?.(data.user);
    } catch (err) {
      // The API returns a field -> message map for validation problems.
      setErrors(err.response?.data?.details ?? {});
      setBanner({ tone: 'error', text: err.userMessage });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800">Create user account</h3>
        {onCancel && (
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Close
          </Button>
        )}
      </div>

      {banner && (
        <Alert tone={banner.tone} onDismiss={() => setBanner(null)}>
          {banner.text}
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="fullName"
          label="Full name"
          value={form.fullName}
          onChange={set('fullName')}
          error={errors.fullName}
          placeholder="Dr. A. Sharma"
          required
        />
        <Field
          id="email"
          label="Email address"
          type="email"
          value={form.email}
          onChange={set('email')}
          error={errors.email}
          placeholder="name@moil.gov.in"
          required
        />
        <Field
          id="designation"
          label="Designation"
          value={form.designation}
          onChange={set('designation')}
          error={errors.designation}
          placeholder="Senior Geologist"
        />
        <Field
          id="phone"
          label="Phone"
          value={form.phone}
          onChange={set('phone')}
          error={errors.phone}
          placeholder="+91 98765 43210"
        />
      </div>

      {/* Role assignment */}
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-slate-700">Assign role</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {ASSIGNABLE_ROLES.map((role) => (
            <label
              key={role}
              className={`cursor-pointer rounded-lg border p-3 transition ${
                form.role === role
                  ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-500/20'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <input
                type="radio"
                name="role"
                value={role}
                checked={form.role === role}
                onChange={() => setForm((f) => ({ ...f, role }))}
                className="sr-only"
              />
              <span className="block text-sm font-medium text-slate-800">
                {ROLE_LABELS[role]}
              </span>
              <span className="mt-1 block text-xs leading-snug text-slate-500">
                {ROLE_DESCRIPTIONS[role]}
              </span>
            </label>
          ))}
        </div>
        {errors.role && <p className="mt-1.5 text-xs font-medium text-rose-600">{errors.role}</p>}
      </fieldset>

      <Field
        id="password"
        label="Temporary password"
        type="password"
        value={form.password}
        onChange={set('password')}
        error={errors.password}
        hint="At least 8 characters, with an upper case letter, a lower case letter and a number. Share it securely — it is never shown again."
        autoComplete="new-password"
        required
      />

      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button variant="secondary" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
        )}
        <Button type="submit" loading={saving}>
          Create account
        </Button>
      </div>
    </form>
  );
}
