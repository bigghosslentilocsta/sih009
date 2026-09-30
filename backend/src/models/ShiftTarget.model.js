/**
 * ShiftTarget - planned versus actual production for one sector on one day.
 *
 * A compound unique index on (date, sector) keeps the seed idempotent and
 * stops double-posting a shift from an operator terminal.
 */

import mongoose from 'mongoose';

import { SECTOR_IDS } from '../config/operations.js';

const shiftTargetSchema = new mongoose.Schema(
  {
    date: {
      type: Date,
      required: [true, 'date is required'],
      index: true,
    },

    sector: {
      type: String,
      required: [true, 'sector is required'],
      enum: { values: SECTOR_IDS, message: '`sector` is not a known sector' },
    },

    target_tonnes: {
      type: Number,
      required: [true, 'target_tonnes is required'],
      min: 0,
    },

    // Null until the shift is actually reported.
    actual_tonnes: { type: Number, min: 0, default: null },

    shift: {
      type: String,
      enum: { values: ['day', 'night', 'total'], message: '`shift` is not valid' },
      default: 'total',
    },

    // Weather observed on the day - kept for post-hoc analysis.
    rainfall_mm: { type: Number, min: 0, default: 0 },
    downtime_hours: { type: Number, min: 0, default: 0 },
    notes: { type: String, trim: true, maxlength: 500, default: '' },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// One record per sector per day.
shiftTargetSchema.index({ date: 1, sector: 1 }, { unique: true });

shiftTargetSchema.virtual('id').get(function id() {
  return this._id.toString();
});

/** Realised tonnage as a % of target. Null while the shift is unreported. */
shiftTargetSchema.virtual('attainment_pct').get(function attainment() {
  if (this.actual_tonnes === null || this.actual_tonnes === undefined) return null;
  if (!this.target_tonnes) return null;
  return Math.round((this.actual_tonnes / this.target_tonnes) * 1000) / 10;
});

/** Signed shortfall in tonnes (positive means production missed the target). */
shiftTargetSchema.virtual('shortfall_tonnes').get(function shortfall() {
  if (this.actual_tonnes === null || this.actual_tonnes === undefined) return null;
  return Math.round((this.target_tonnes - this.actual_tonnes) * 10) / 10;
});

shiftTargetSchema.set('toJSON', {
  virtuals: true,
  transform(_doc, ret) {
    delete ret.__v;
    return ret;
  },
});

export const ShiftTarget = mongoose.model('ShiftTarget', shiftTargetSchema);
export default ShiftTarget;
