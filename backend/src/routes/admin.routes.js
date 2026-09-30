/**
 * Admin-only user management.
 * Every route in this router is gated by `authenticate` + `requireAdmin`.
 *
 *   GET    /api/admin/users          list / search / filter / paginate
 *   POST   /api/admin/users          create a user and assign a role
 *   GET    /api/admin/users/:id      single user
 *   PATCH  /api/admin/users/:id      update role / active state / details
 *   DELETE /api/admin/users/:id      deactivate (soft delete)
 *   POST   /api/admin/users/:id/reset-password
 */

import { Router } from 'express';
import mongoose from 'mongoose';

import { ROLES, isValidRole } from '../config/roles.js';
import { authenticate, requireAdmin } from '../middleware/auth.middleware.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { toFieldMap, validatePassword, validateUserInput } from '../utils/validate.js';
import * as authService from '../services/auth.service.js';
import User from '../models/User.model.js';

const router = Router();

// Apply authentication + admin check to everything below.
router.use(authenticate, requireAdmin);

const assertObjectId = (id) => {
  if (!mongoose.isValidObjectId(id)) throw ApiError.badRequest('Invalid user id.');
};

/** Refuse changes that would remove the last usable administrator. */
async function assertNotLastAdmin(targetUser, { newRole, newIsActive }) {
  const losingAdmin =
    (newRole !== undefined && newRole !== ROLES.ADMIN) ||
    (newIsActive !== undefined && newIsActive === false);

  if (!losingAdmin) return;
  if (targetUser.role !== ROLES.ADMIN) return;

  const remaining = await authService.activeAdminCount(targetUser._id);
  if (remaining === 0) {
    throw ApiError.conflict(
      'This is the last active administrator. Promote another user to admin first.',
    );
  }
}

/** GET /api/admin/users */
router.get(
  '/users',
  asyncHandler(async (req, res) => {
    const { role, search, page, limit } = req.query;

    if (role && !isValidRole(role)) {
      throw ApiError.badRequest(`Unknown role: ${role}.`);
    }

    const result = await authService.listUsers({ role, search, page, limit });
    res.json(result);
  }),
);

/** POST /api/admin/users */
router.post(
  '/users',
  asyncHandler(async (req, res) => {
    const { fullName, email, password, role, designation, phone } = req.body ?? {};

    const problems = validateUserInput({ fullName, email, role, password });
    if (problems.length > 0) {
      throw ApiError.badRequest('Validation failed.', toFieldMap(problems));
    }

    const user = await authService.createUser(
      { fullName, email, password, role, designation, phone },
      req.user._id,
    );

    res.status(201).json({ user });
  }),
);

/** GET /api/admin/users/:id */
router.get(
  '/users/:id',
  asyncHandler(async (req, res) => {
    assertObjectId(req.params.id);
    const user = await User.findById(req.params.id);
    if (!user) throw ApiError.notFound('User not found.');
    res.json({ user: user.toSafeObject() });
  }),
);

/** PATCH /api/admin/users/:id */
router.patch(
  '/users/:id',
  asyncHandler(async (req, res) => {
    assertObjectId(req.params.id);
    const { fullName, role, designation, phone, isActive } = req.body ?? {};

    const user = await User.findById(req.params.id);
    if (!user) throw ApiError.notFound('User not found.');

    if (role !== undefined && !isValidRole(role)) {
      throw ApiError.badRequest(`Unknown role: ${role}.`);
    }

    // Guard against an admin locking themselves out.
    if (user._id.equals(req.user._id)) {
      if (role !== undefined && role !== ROLES.ADMIN) {
        throw ApiError.badRequest('You cannot change your own role.');
      }
      if (isActive === false) {
        throw ApiError.badRequest('You cannot deactivate your own account.');
      }
    }

    await assertNotLastAdmin(user, { newRole: role, newIsActive: isActive });

    if (fullName !== undefined) {
      if (String(fullName).trim().length < 2) {
        throw ApiError.badRequest('Validation failed.', {
          fullName: 'Full name must be at least 2 characters.',
        });
      }
      user.fullName = fullName.trim();
    }
    if (role !== undefined) user.role = role;
    if (designation !== undefined) user.designation = designation.trim();
    if (phone !== undefined) user.phone = phone.trim();
    if (isActive !== undefined) user.isActive = Boolean(isActive);

    await user.save();

    // A now-deactivated user's live session stops working immediately, because
    // `authenticate` re-reads the document on every request.
    res.json({ user: user.toSafeObject() });
  }),
);

/** DELETE /api/admin/users/:id - soft delete to preserve the audit trail. */
router.delete(
  '/users/:id',
  asyncHandler(async (req, res) => {
    assertObjectId(req.params.id);
    const user = await User.findById(req.params.id);
    if (!user) throw ApiError.notFound('User not found.');

    if (user._id.equals(req.user._id)) {
      throw ApiError.badRequest('You cannot deactivate your own account.');
    }

    await assertNotLastAdmin(user, { newIsActive: false });

    user.isActive = false;
    await user.save();

    res.json({ user: user.toSafeObject(), message: 'User deactivated.' });
  }),
);

/** POST /api/admin/users/:id/reset-password */
router.post(
  '/users/:id/reset-password',
  asyncHandler(async (req, res) => {
    assertObjectId(req.params.id);
    const { newPassword } = req.body ?? {};

    const user = await User.findById(req.params.id);
    if (!user) throw ApiError.notFound('User not found.');

    let password = newPassword;
    if (password === undefined) {
      // Generate a readable temporary password when none is supplied.
      password = `Mn${Math.random().toString(36).slice(2, 8).toUpperCase()}1`;
    }

    const problems = validatePassword(password);
    if (problems.length > 0) {
      throw ApiError.badRequest('Validation failed.', toFieldMap(problems));
    }

    user.password = password;
    await user.save(); // pre-save hook re-hashes and clears any lockout

    res.json({
      message: 'Password reset. Share it securely; it will not be shown again.',
      // Only returned when the server generated it, and only this once.
      temporaryPassword: newPassword === undefined ? password : undefined,
    });
  }),
);

export default router;

