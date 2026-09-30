/**
 * Authentication & role-based authorisation middleware.
 *
 *   authenticate        -> verifies the `Authorization: Bearer <token>` header
 *                          and loads the full user document onto `req.user`
 *   authorize(...roles)  -> 403s unless `req.user.role` is in the allowed list
 *   requireAdmin        -> shorthand for authorize(ROLES.ADMIN)
 */

import jwt from 'jsonwebtoken';

import { ROLES } from '../config/roles.js';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import User from '../models/User.model.js';

/** Mint an access token for a user document. */
export function signToken(user) {
  return jwt.sign(
    { sub: user._id.toString(), role: user.role, email: user.email },
    env.jwt.secret,
    { expiresIn: env.jwt.expiresIn, issuer: env.jwt.issuer },
  );
}

function extractBearer(req) {
  const header = req.headers.authorization ?? '';
  const [scheme, token] = header.split(' ');
  if (!token || scheme.toLowerCase() !== 'bearer') return null;
  return token.trim();
}

/**
 * Populates `req.user` (a live DB document) and `req.token`.
 * Always re-reads the user so a deactivated account or changed role takes
 * effect immediately instead of waiting for the token to expire.
 */
export const authenticate = asyncHandler(async (req, _res, next) => {
  const token = extractBearer(req);
  if (!token) throw ApiError.unauthorized('Missing Authorization: Bearer <token> header');

  let payload;
  try {
    payload = jwt.verify(token, env.jwt.secret, { issuer: env.jwt.issuer });
  } catch (err) {
    const message =
      err.name === 'TokenExpiredError' ? 'Session expired, please sign in again.' : 'Invalid token.';
    throw ApiError.unauthorized(message);
  }

  const user = await User.findById(payload.sub);
  if (!user) throw ApiError.unauthorized('Account no longer exists.');
  if (!user.isActive) throw ApiError.forbidden('This account has been deactivated.');

  req.user = user;
  req.token = token;
  return next();
});

/** Restrict a route to the given roles. `authorize()` with no args = any authed user. */
export function authorize(...roles) {
  const allowed = roles.flat();
  return (req, _res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (allowed.length > 0 && !allowed.includes(req.user.role)) {
      return next(
        ApiError.forbidden(
          `This action requires one of the following roles: ${allowed.join(', ')}.`,
        ),
      );
    }
    return next();
  };
}

export const requireAdmin = authorize(ROLES.ADMIN);
