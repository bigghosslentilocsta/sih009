/**
 * User model with role-based access control.
 *
 * Passwords are stored as bcrypt hashes only and the field is `select: false`
 * so it can never leak through an accidental `.find()`.
 */

import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';

import { ROLES, ROLES_LIST } from '../config/roles.js';
import { env } from '../config/env.js';

const SALT_ROUNDS = env.bcryptRounds;

/** Fields safe to return to a client. */
const SAFE_FIELDS = [
  'id',
  'fullName',
  'email',
  'role',
  'designation',
  'phone',
  'isActive',
  'lastLoginAt',
  'createdAt',
  'updatedAt',
];

const userSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: [true, 'Full name is required'],
      trim: true,
      minlength: 2,
      maxlength: 120,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    // Never returned unless explicitly selected with `.select('+password')`.
    password: {
      type: String,
      required: [true, 'Password is required'],
      select: false,
    },
    role: {
      type: String,
      enum: {
        values: ROLES_LIST,
        message: '`role` is not a supported role: {VALUE}',
      },
      default: ROLES.GEOLOGIST,
      required: true,
    },
    designation: { type: String, trim: true, maxlength: 120, default: '' },
    phone: { type: String, trim: true, maxlength: 24, default: '' },

    isActive: { type: Boolean, default: true },

    lastLoginAt: { type: Date, default: null },
    passwordChangedAt: { type: Date, default: Date.now },

    // Brute-force protection state.
    failedLoginAttempts: { type: Number, default: 0, select: false },
    lockedUntil: { type: Date, default: null, select: false },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: { virtuals: true, transform: safeTransform },
    toObject: { virtuals: true, transform: safeTransform },
  },
);

/** Belt-and-braces: strip sensitive fields from every serialised user. */
function safeTransform(_doc, ret) {
  delete ret.password;
  delete ret.failedLoginAttempts;
  delete ret.lockedUntil;
  delete ret.__v;
  return ret;
}

userSchema.virtual('id').get(function id() {
  return this._id.toString();
});

/** Hash the password whenever it is set or changed. */
userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next();

  this.password = await bcrypt.hash(this.password, SALT_ROUNDS);
  this.passwordChangedAt = new Date();

  // A fresh password clears any lockout.
  this.failedLoginAttempts = 0;
  this.lockedUntil = null;
  return next();
});

/** Constant-time comparison against the stored hash. */
userSchema.methods.comparePassword = function comparePassword(candidate) {
  if (!this.password) {
    throw new Error('comparePassword called on a user without the password field selected');
  }
  return bcrypt.compare(candidate, this.password);
};

/** True when the account is temporarily locked out after failed logins. */
userSchema.methods.isLocked = function isLocked() {
  return Boolean(this.lockedUntil && this.lockedUntil.getTime() > Date.now());
};

/** Serialise to the exact shape the API returns. */
userSchema.methods.toSafeObject = function toSafeObject() {
  return {
    id: this._id.toString(),
    fullName: this.fullName,
    email: this.email,
    role: this.role,
    designation: this.designation,
    phone: this.phone,
    isActive: this.isActive,
    lastLoginAt: this.lastLoginAt,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

userSchema.statics.hashPassword = function hashPassword(plain) {
  return bcrypt.hash(plain, SALT_ROUNDS);
};

/** Case-insensitive uniqueness check used before create/update. */
userSchema.statics.emailExists = async function emailExists(email, excludeId = null) {
  const query = { email: String(email).toLowerCase().trim() };
  if (excludeId) query._id = { $ne: excludeId };
  return Boolean(await this.exists(query));
};

export const User = mongoose.model('User', userSchema);
export default User;
