/**
 * Small, dependency-free validation helpers shared by the auth and admin routes.
 * Each returns a list of `{ field, message }` problems.
 */

import { ROLES_LIST } from '../config/roles.js';

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const isValidEmail = (value) => typeof value === 'string' && EMAIL_RE.test(value.trim());

/**
 * Password policy: at least 8 chars with an upper case letter, a lower case
 * letter and a digit. Deliberately length-first (NIST SP 800-63B guidance) -
 * no forced symbol classes.
 */
export function validatePassword(password) {
  const problems = [];
  if (typeof password !== 'string' || password.length === 0) {
    return [{ field: 'password', message: 'Password is required.' }];
  }
  if (password.length < 8) {
    problems.push({ field: 'password', message: 'Password must be at least 8 characters long.' });
  }
  if (password.length > 128) {
    problems.push({ field: 'password', message: 'Password must be at most 128 characters long.' });
  }
  if (!/[a-z]/.test(password)) {
    problems.push({ field: 'password', message: 'Password must include a lower case letter.' });
  }
  if (!/[A-Z]/.test(password)) {
    problems.push({ field: 'password', message: 'Password must include an upper case letter.' });
  }
  if (!/\d/.test(password)) {
    problems.push({ field: 'password', message: 'Password must include a number.' });
  }
  return problems;
}

export function validateUserInput({ fullName, email, role, password }) {
  const problems = [];

  if (!fullName || typeof fullName !== 'string' || fullName.trim().length < 2) {
    problems.push({ field: 'fullName', message: 'Full name must be at least 2 characters.' });
  } else if (fullName.trim().length > 120) {
    problems.push({ field: 'fullName', message: 'Full name must be at most 120 characters.' });
  }

  if (!isValidEmail(email)) {
    problems.push({ field: 'email', message: 'A valid email address is required.' });
  }

  if (!ROLES_LIST.includes(role)) {
    problems.push({
      field: 'role',
      message: `Role must be one of: ${ROLES_LIST.join(', ')}.`,
    });
  }

  if (password !== undefined) {
    problems.push(...validatePassword(password));
  }

  return problems;
}

/** Collapse problem objects into a single field->message map. */
export const toFieldMap = (problems) =>
  Object.fromEntries(problems.map((p) => [p.field, p.message]));
