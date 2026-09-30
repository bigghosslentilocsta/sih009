/**
 * Authentication and user-management business logic.
 * Routes stay thin; everything stateful lives here.
 */

import bcrypt from 'bcryptjs';

import { env } from '../config/env.js';
import { ROLES } from '../config/roles.js';
import { ApiError } from '../utils/ApiError.js';
import { signToken } from '../middleware/auth.middleware.js';
import User from '../models/User.model.js';

/**
 * Verify credentials and issue a token.
 *
 * Security notes:
 *  - A missing user and a wrong password return the *same* message so the
 *    endpoint cannot be used to enumerate valid accounts.
 *  - Repeated failures lock the account for `LOCKOUT_MINUTES`.
 */
/**
 * A pre-computed bcrypt hash of a random string. Used to burn the same amount
 * of CPU when the email does not exist, so response timing cannot be used to
 * enumerate valid accounts.
 */
const DUMMY_HASH = '$2a$12$C6UzMDM.H6dfI/f/IKcEe.7Ky5HhR9qGCf8mY3n1oXq3XoGq3XoGq';

export async function login({ email, password }) {
  const normalisedEmail = String(email ?? '').toLowerCase().trim();

  const user = await User.findOne({ email: normalisedEmail }).select(
    '+password +failedLoginAttempts +lockedUntil',
  );

  if (!user) {
    // Constant-time-ish: same bcrypt work regardless of account existence.
    await bcrypt.compare(String(password ?? ''), DUMMY_HASH);
    throw ApiError.unauthorized('Invalid email or password.');
  }

  if (user.isLocked()) {
    const minutes = Math.max(1, Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000));
    throw ApiError.tooManyRequests(
      `Account locked due to too many failed attempts. Try again in ${minutes} minute(s).`,
    );
  }

  if (!user.isActive) {
    throw ApiError.forbidden('This account has been deactivated. Contact an administrator.');
  }

  const matches = await user.comparePassword(password);
  if (!matches) {
    user.failedLoginAttempts = (user.failedLoginAttempts ?? 0) + 1;
    if (user.failedLoginAttempts >= env.maxFailedLogins) {
      user.lockedUntil = new Date(Date.now() + env.lockoutMinutes * 60_000);
      user.failedLoginAttempts = 0;
      await user.save({ validateBeforeSave: false });
      throw ApiError.tooManyRequests(
        `Account locked for ${env.lockoutMinutes} minutes after ${env.maxFailedLogins} failed attempts.`,
      );
    }
    await user.save({ validateBeforeSave: false });
    throw ApiError.unauthorized('Invalid email or password.');
  }

  // Success - clear the lockout state and stamp the login.
  user.failedLoginAttempts = 0;
  user.lockedUntil = null;
  user.lastLoginAt = new Date();
  await user.save({ validateBeforeSave: false });

  return { user: user.toSafeObject(), token: signToken(user) };
}

/** Create a user. Rejects duplicate emails. */
export async function createUser({ fullName, email, password, role, designation, phone }, createdById) {
  const normalisedEmail = String(email).toLowerCase().trim();

  if (await User.emailExists(normalisedEmail)) {
    throw ApiError.conflict('A user with that email address already exists.', {
      email: 'A user with that email address already exists.',
    });
  }

  const user = await User.create({
    fullName: fullName.trim(),
    email: normalisedEmail,
    password, // hashed by the pre-save hook
    role,
    designation: designation?.trim() ?? '',
    phone: phone?.trim() ?? '',
    createdBy: createdById ?? null,
  });

  return user.toSafeObject();
}

/** Update the caller's own profile (never role, never isActive). */
export async function updateOwnProfile(user, { fullName, phone, designation }) {
  if (fullName !== undefined) user.fullName = fullName.trim();
  if (phone !== undefined) user.phone = phone.trim();
  if (designation !== undefined) user.designation = designation.trim();
  await user.save();
  return user.toSafeObject();
}

/** Change the caller's own password after verifying the current one. */
export async function changePassword(user, { currentPassword, newPassword }) {
  const stored = await User.findById(user._id).select('+password');
  if (!stored) throw ApiError.unauthorized('Account no longer exists.');

  if (!(await stored.comparePassword(currentPassword))) {
    throw ApiError.badRequest('Your current password is incorrect.', {
      currentPassword: 'Your current password is incorrect.',
    });
  }

  if (await stored.comparePassword(newPassword)) {
    throw ApiError.badRequest('The new password must be different from your current password.', {
      newPassword: 'Choose a password you have not used before.',
    });
  }

  stored.password = newPassword; // pre-save hook re-hashes and updates passwordChangedAt
  await stored.save();

  // Re-issue a token so the current session keeps working with the new state.
  return { token: signToken(stored) };
}

/** Count active administrators - used to protect the last admin. */
export async function activeAdminCount(excludeId = null) {
  const query = { role: ROLES.ADMIN, isActive: true };
  if (excludeId) query._id = { $ne: excludeId };
  return User.countDocuments(query);
}

export async function listUsers({ role, search, page = 1, limit = 25 } = {}) {
  const query = {};
  if (role) query.role = role;
  if (search) {
    const rx = new RegExp(String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    query.$or = [{ fullName: rx }, { email: rx }];
  }

  const safeLimit = Math.min(Math.max(Number(limit) || 25, 1), 100);
  const safePage = Math.max(Number(page) || 1, 1);

  const [items, total] = await Promise.all([
    User.find(query)
      .sort({ createdAt: -1 })
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit),
    User.countDocuments(query),
  ]);

  return {
    items: items.map((u) => u.toSafeObject()),
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      pages: Math.max(1, Math.ceil(total / safeLimit)),
    },
  };
}
