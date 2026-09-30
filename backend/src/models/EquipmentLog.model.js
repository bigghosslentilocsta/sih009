/**
 * EquipmentLog - the state of a single piece of mining plant.
 *
 * This is the primary input to the Module B risk model: the proportion of
 * machines not in `active` status, and how soon maintenance falls due, drive
 * the projected production shortfall alongside the weather forecast.
 */

import mongoose from 'mongoose';

import {
  EQUIPMENT_STATUSES,
  EQUIPMENT_TYPES,
  SECTOR_IDS,
} from '../config/operations.js';

const equipmentLogSchema = new mongoose.Schema(
  {
    machine_id: {
      type: String,
      required: [true, 'machine_id is required'],
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    name: { type: String, trim: true, maxlength: 120, default: '' },

    type: {
      type: String,
      required: [true, 'type is required'],
      enum: { values: EQUIPMENT_TYPES, message: '`type` must be one of: {VALUES}' },
    },

    status: {
      type: String,
      required: true,
      enum: { values: EQUIPMENT_STATUSES, message: '`status` must be one of: {VALUES}' },
      default: 'active',
      index: true,
    },

    // Cumulative engine/operating hours - drives wear-based failure risk.
    hours_active: { type: Number, min: 0, default: 0 },

    // Hours the machine has been out of service this week.
    downtime_hours: { type: Number, min: 0, default: 0 },

    maintenance_due_date: { type: Date, required: [true, 'maintenance_due_date is required'] },
    last_maintenance_date: { type: Date, default: null },

    sector: {
      type: String,
      enum: { values: SECTOR_IDS, message: '`sector` is not a known sector' },
      required: true,
      index: true,
    },

    /**
     * 0-1 probability of an unplanned failure in the forecast window.
     * Ops can override this; the seed derives it from status + wear.
     */
    failure_probability: { type: Number, min: 0, max: 1, default: 0 },

    notes: { type: String, trim: true, maxlength: 500, default: '' },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

equipmentLogSchema.virtual('id').get(function id() {
  return this._id.toString();
});

/** Days until scheduled maintenance (negative = overdue). */
equipmentLogSchema.virtual('days_until_maintenance').get(function days() {
  if (!this.maintenance_due_date) return null;
  return Math.round((this.maintenance_due_date.getTime() - Date.now()) / 86_400_000);
});

equipmentLogSchema.virtual('is_producing').get(function producing() {
  return this.status === 'active';
});

/**
 * Derive a failure probability from status, wear and maintenance urgency.
 * Used by the seed and as a fallback when ops has not set an explicit value.
 */
equipmentLogSchema.methods.deriveFailureProbability = function deriveFailureProbability() {
  let p = 0.05; // baseline

  if (this.status === 'down') p += 0.55;
  if (this.status === 'maintenance') p += 0.15;

  // Wear: rises past ~4000 h.
  if (this.hours_active > 4000) {
    p += Math.min(0.25, ((this.hours_active - 4000) / 10000) * 0.5);
  }

  // Overdue or imminent maintenance.
  const days = this.days_until_maintenance;
  if (days !== null) {
    if (days < 0) p += 0.30;
    else if (days <= 7) p += 0.18;
  }

  // Recurring downtime.
  if (this.downtime_hours > 8) p += 0.10;

  return Math.min(1, Math.round(p * 100) / 100);
};

equipmentLogSchema.set('toJSON', {
  virtuals: true,
  transform(_doc, ret) {
    ret.days_until_maintenance = ret.days_until_maintenance ?? undefined;
    delete ret.__v;
    return ret;
  },
});

export const EquipmentLog = mongoose.model('EquipmentLog', equipmentLogSchema);
export default EquipmentLog;
