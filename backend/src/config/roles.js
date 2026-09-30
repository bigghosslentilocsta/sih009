/**
 * Role definitions for SIH 26009 RBAC.
 * Single source of truth - the User model, the auth middleware, the seed
 * script and the frontend all derive from these constants.
 */

export const ROLES = Object.freeze({
  ADMIN: 'admin',
  GEOLOGIST: 'geologist',
  OPERATIONS_MANAGER: 'operations_manager',
  EXECUTIVE: 'executive',
});

/** Valid values for the `role` field. */
export const ROLES_LIST = Object.freeze(Object.values(ROLES));

export const ROLE_LABELS = Object.freeze({
  [ROLES.ADMIN]: 'Administrator',
  [ROLES.GEOLOGIST]: 'Geologist',
  [ROLES.OPERATIONS_MANAGER]: 'Operations Manager',
  [ROLES.EXECUTIVE]: 'Executive',
});

export const ROLE_DESCRIPTIONS = Object.freeze({
  [ROLES.ADMIN]: 'Full platform access, including user administration.',
  [ROLES.GEOLOGIST]: 'Module A - geospatial exploration and reserve mapping.',
  [ROLES.OPERATIONS_MANAGER]: 'Module B - production shortfall and risk prediction.',
  [ROLES.EXECUTIVE]: 'Module C - executive summary and macro KPIs.',
});

/**
 * Where each role lands after login. Kept in sync with the frontend router.
 *   admin              -> user management panel
 *   geologist          -> geospatial map (Module A)
 *   operations_manager -> operations dashboard (Module B)
 *   executive          -> executive summary (Module C)
 */
export const ROLE_HOME = Object.freeze({
  [ROLES.ADMIN]: '/admin',
  [ROLES.GEOLOGIST]: '/map',
  [ROLES.OPERATIONS_MANAGER]: '/dashboard',
  [ROLES.EXECUTIVE]: '/executive',
});

/** Roles an admin is allowed to assign when creating a user. */
export const ASSIGNABLE_ROLES = Object.freeze([
  ROLES.GEOLOGIST,
  ROLES.OPERATIONS_MANAGER,
  ROLES.EXECUTIVE,
]);

export const isValidRole = (role) => ROLES_LIST.includes(role);
export const isAssignableRole = (role) => ASSIGNABLE_ROLES.includes(role);
