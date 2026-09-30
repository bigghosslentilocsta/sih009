/**
 * Authentication routes.
 *
 *   POST   /api/auth/login            public, rate limited
 *   POST   /api/auth/register         admin only (self-registration is disabled)
 *   GET    /api/auth/me               current user
 *   PATCH  /api/auth/profile          current user - name / phone / designation
 *   POST   /api/auth/change-password  current user
 *   POST   /api/auth/logout           current user (token is client-side)
 */

import { Router } from 'express';
import rateLimit from 'express-rate-limit';

import { ROLE_HOME } from '../config/roles.js';
import { authenticate, requireAdmin } from '../middleware/auth.middleware.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { toFieldMap, validatePassword, validateUserInput } from '../utils/validate.js';
import * as authService from '../services/auth.service.js';

const router = Router();

/** Tight limiter on credential endpoints to blunt brute-force attempts. */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: {
    error: 'TooManyRequests',
    message: 'Too many sign-in attempts. Please try again in 15 minutes.',
  },
});

/** POST /api/auth/login */
router.post(
  '/login',
  loginLimiter,
  asyncHandler(async (req, res) => {
    const { email, password } = req.body ?? {};

    if (!email || !password) {
      throw ApiError.badRequest('Email and password are required.', {
        ...(email ? {} : { email: 'Email is required.' }),
        ...(password ? {} : { password: 'Password is required.' }),
      });
    }

    const { user, token } = await authService.login({ email, password });

    // `home` lets the client redirect straight to the right module.
    res.json({ user, token, home: ROLE_HOME[user.role] });
  }),
);

/**
 * POST /api/auth/register
 * Admin-managed account creation. Open self-registration is deliberately
 * disabled - accounts may only be issued by an administrator.
 */
router.post(
  '/register',
  authenticate,
  requireAdmin,
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

/** GET /api/auth/me */
router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    res.json({ user: req.user.toSafeObject(), home: ROLE_HOME[req.user.role] });
  }),
);

/** PATCH /api/auth/profile - role and isActive are intentionally not editable. */
router.patch(
  '/profile',
  authenticate,
  asyncHandler(async (req, res) => {
    const { fullName, phone, designation } = req.body ?? {};

    if (fullName !== undefined && String(fullName).trim().length < 2) {
      throw ApiError.badRequest('Validation failed.', {
        fullName: 'Full name must be at least 2 characters.',
      });
    }

    const user = await authService.updateOwnProfile(req.user, { fullName, phone, designation });
    res.json({ user });
  }),
);

/** POST /api/auth/change-password */
router.post(
  '/change-password',
  authenticate,
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body ?? {};

    const missing = {
      ...(currentPassword ? {} : { currentPassword: 'Current password is required.' }),
      ...(newPassword ? {} : { newPassword: 'New password is required.' }),
    };
    if (Object.keys(missing).length > 0) {
      throw ApiError.badRequest('Validation failed.', missing);
    }

    const problems = validatePassword(newPassword);
    if (problems.length > 0) {
      throw ApiError.badRequest('Validation failed.', toFieldMap(problems));
    }

    const { token } = await authService.changePassword(req.user, {
      currentPassword,
      newPassword,
    });

    res.json({ message: 'Password updated successfully.', token });
  }),
);

/** POST /api/auth/logout - stateless JWT, so this only acknowledges the intent. */
router.post(
  '/logout',
  authenticate,
  asyncHandler(async (_req, res) => {
    res.json({ message: 'Signed out.' });
  }),
);

export default router;
