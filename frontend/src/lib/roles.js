/**
 * Frontend mirror of `backend/src/config/roles.js`.
 * Kept deliberately small - the API is the source of truth.
 */

export const ROLES = Object.freeze({
  ADMIN: 'admin',
  GEOLOGIST: 'geologist',
  OPERATIONS_MANAGER: 'operations_manager',
  EXECUTIVE: 'executive',
});

export const ROLE_LABELS = Object.freeze({
  [ROLES.ADMIN]: 'Administrator',
  [ROLES.GEOLOGIST]: 'Geologist',
  [ROLES.OPERATIONS_MANAGER]: 'Operations Manager',
  [ROLES.EXECUTIVE]: 'Executive',
});

/** Short blurb shown next to each role in the admin creation form. */
export const ROLE_DESCRIPTIONS = Object.freeze({
  [ROLES.ADMIN]: 'Full platform access, including user administration.',
  [ROLES.GEOLOGIST]: 'Module A - geospatial exploration and reserve mapping.',
  [ROLES.OPERATIONS_MANAGER]: 'Module B - production shortfall and risk prediction.',
  [ROLES.EXECUTIVE]: 'Module C - executive summary and macro KPIs.',
});

/** Roles an admin can assign when creating a user. */
export const ASSIGNABLE_ROLES = Object.freeze([
  ROLES.GEOLOGIST,
  ROLES.OPERATIONS_MANAGER,
  ROLES.EXECUTIVE,
]);

/** Fallback home per role - the API also returns this on login. */
export const ROLE_HOME = Object.freeze({
  [ROLES.ADMIN]: '/admin',
  [ROLES.GEOLOGIST]: '/map',
  [ROLES.OPERATIONS_MANAGER]: '/dashboard',
  [ROLES.EXECUTIVE]: '/executive',
});

/** Tailwind classes per role for badges. */
export const ROLE_BADGE = Object.freeze({
  [ROLES.ADMIN]: 'bg-rose-100 text-rose-700',
  [ROLES.GEOLOGIST]: 'bg-sky-100 text-sky-700',
  [ROLES.OPERATIONS_MANAGER]: 'bg-amber-100 text-amber-800',
  [ROLES.EXECUTIVE]: 'bg-violet-100 text-violet-700',
});

export const initialsOf = (fullName = '') =>
  fullName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || '?';
