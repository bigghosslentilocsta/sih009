/**
 * Account settings - available to every role.
 *  - profile details (name, designation, phone)
 *  - password change (requires the current password)
 * Role and email are read-only: only an administrator can change them.
 */

import { useState } from 'react';

import Alert from '../components/ui/Alert.jsx';
import Button from '../components/ui/Button.jsx';
import Field from '../components/ui/Field.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { ROLE_BADGE, ROLE_DESCRIPTIONS, ROLE_LABELS, initialsOf } from '../lib/roles.js';

export default function Settings() {
  const { user, updateProfile, changePassword } = useAuth();

  const [profile, setProfile] = useState({
    fullName: user?.fullName ?? '',
    designation: user?.designation ?? '',
    phone: user?.phone ?? '',
  });
  const [profileErrors, setProfileErrors] = useState({});
  const [profileBanner, setProfileBanner] = useState(null);
  const [savingProfile, setSavingProfile] = useState(false);

  const [passwords, setPasswords] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [passwordErrors, setPasswordErrors] = useState({});
  const [passwordBanner, setPasswordBanner] = useState(null);
  const [savingPassword, setSavingPassword] = useState(false);

  const setProfileField = (key) => (e) => setProfile((p) => ({ ...p, [key]: e.target.value }));
  const setPasswordField = (key) => (e) => setPasswords((p) => ({ ...p, [key]: e.target.value }));

  async function saveProfile(event) {
    event.preventDefault();
    setProfileErrors({});
    setProfileBanner(null);
    setSavingProfile(true);
    try {
      await updateProfile(profile);
      setProfileBanner({ tone: 'success', text: 'Profile updated.' });
    } catch (err) {
      setProfileErrors(err.response?.data?.details ?? {});
      setProfileBanner({ tone: 'error', text: err.userMessage });
    } finally {
      setSavingProfile(false);
    }
  }

  async function savePassword(event) {
    event.preventDefault();
    setPasswordErrors({});
    setPasswordBanner(null);

    if (passwords.newPassword !== passwords.confirmPassword) {
      setPasswordErrors({ confirmPassword: 'Passwords do not match.' });
      return;
    }

    setSavingPassword(true);
    try {
      await changePassword({
        currentPassword: passwords.currentPassword,
        newPassword: passwords.newPassword,
      });
      setPasswordBanner({ tone: 'success', text: 'Password changed. You stay signed in.' });
      setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      setPasswordErrors(err.response?.data?.details ?? {});
      setPasswordBanner({ tone: 'error', text: err.userMessage });
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-slate-800">Settings</h2>
        <p className="text-sm text-slate-500">Manage your account details and password.</p>
      </div>

      {/* Account summary */}
      <div className="card flex items-center gap-4">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-500/10 text-lg font-semibold text-brand-600">
          {initialsOf(user?.fullName)}
        </span>
        <div className="min-w-0">
          <p className="truncate font-semibold text-slate-800">{user?.fullName}</p>
          <p className="truncate text-sm text-slate-500">{user?.email}</p>
          <span
            className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
              ROLE_BADGE[user?.role] ?? 'bg-slate-100 text-slate-700'
            }`}
          >
            {ROLE_LABELS[user?.role] ?? user?.role}
          </span>
        </div>
      </div>

      {/* Profile */}
      <form onSubmit={saveProfile} className="card space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Profile details</h3>
          <p className="text-xs text-slate-500">
            Your email and role are managed by an administrator.
          </p>
        </div>

        {profileBanner && (
          <Alert tone={profileBanner.tone} onDismiss={() => setProfileBanner(null)}>
            {profileBanner.text}
          </Alert>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="fullName"
            label="Full name"
            value={profile.fullName}
            onChange={setProfileField('fullName')}
            error={profileErrors.fullName}
            required
          />
          <Field
            id="designation"
            label="Designation"
            value={profile.designation}
            onChange={setProfileField('designation')}
            error={profileErrors.designation}
            placeholder="Senior Geologist"
          />
          <Field
            id="phone"
            label="Phone"
            value={profile.phone}
            onChange={setProfileField('phone')}
            error={profileErrors.phone}
            placeholder="+91 98765 43210"
          />
          <Field
            id="role"
            label="Role"
            value={ROLE_LABELS[user?.role] ?? user?.role}
            disabled
            hint={ROLE_DESCRIPTIONS[user?.role]}
          />
        </div>

        <div className="flex justify-end">
          <Button type="submit" loading={savingProfile}>
            Save changes
          </Button>
        </div>
      </form>

      {/* Password */}
      <form onSubmit={savePassword} className="card space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Change password</h3>
          <p className="text-xs text-slate-500">
            At least 8 characters, with an upper case letter, a lower case letter and a number.
          </p>
        </div>

        {passwordBanner && (
          <Alert tone={passwordBanner.tone} onDismiss={() => setPasswordBanner(null)}>
            {passwordBanner.text}
          </Alert>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="currentPassword"
            label="Current password"
            type="password"
            autoComplete="current-password"
            value={passwords.currentPassword}
            onChange={setPasswordField('currentPassword')}
            error={passwordErrors.currentPassword}
            required
          />
          <div className="hidden sm:block" aria-hidden="true" />
          <Field
            id="newPassword"
            label="New password"
            type="password"
            autoComplete="new-password"
            value={passwords.newPassword}
            onChange={setPasswordField('newPassword')}
            error={passwordErrors.newPassword}
            required
          />
          <Field
            id="confirmPassword"
            label="Confirm new password"
            type="password"
            autoComplete="new-password"
            value={passwords.confirmPassword}
            onChange={setPasswordField('confirmPassword')}
            error={passwordErrors.confirmPassword}
            required
          />
        </div>

        <div className="flex justify-end">
          <Button type="submit" loading={savingPassword}>
            Update password
          </Button>
        </div>
      </form>
    </div>
  );
}
