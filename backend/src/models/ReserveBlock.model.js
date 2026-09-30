/**
 * ReserveBlock - a mapped mining lease block and its reserve estimate.
 *
 * This is the source of truth behind the executive "active reserves" KPI.
 * Records carry their own provenance (`source`), so a seeded reference block is
 * never confused with a surveyed or Earth Engine-derived estimate.
 */

import mongoose from 'mongoose';

const CONFIDENCE = ['high', 'medium', 'low'];
const STATUSES = ['mapped', 'analysed', 'prospective'];
const SOURCES = ['seed', 'field_survey', 'gee_analysis', 'moil_records'];

const reserveBlockSchema = new mongoose.Schema(
  {
    block_id: {
      type: String,
      required: [true, 'block_id is required'],
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    state: { type: String, trim: true, maxlength: 80, default: '' },
    district: { type: String, trim: true, maxlength: 80, default: '' },

    area_km2: { type: Number, required: true, min: 0 },
    estimated_reserve_tonnes: { type: Number, required: true, min: 0 },

    // Weighted manganese grade, % Mn.
    average_grade_pct: { type: Number, required: true, min: 0, max: 100 },

    confidence_level: { type: String, enum: CONFIDENCE, default: 'medium' },
    status: { type: String, enum: STATUSES, default: 'mapped', index: true },

    // Where this estimate came from - never silently blend provenance.
    source: { type: String, enum: SOURCES, default: 'seed' },

    // Suitability score from Module A, when one has been run.
    suitability_score: { type: Number, min: 0, max: 100, default: null },

    discovered_at: { type: Date, default: Date.now },
    analysed_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    notes: { type: String, trim: true, maxlength: 500, default: '' },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

reserveBlockSchema.virtual('id').get(function id() {
  return this._id.toString();
});

/** Contained metal tonnes = reserve x grade/100. */
reserveBlockSchema.virtual('contained_metal_tonnes').get(function contained() {
  return Math.round(this.estimated_reserve_tonnes * (this.average_grade_pct / 100));
});

reserveBlockSchema.set('toJSON', {
  virtuals: true,
  transform(_doc, ret) {
    delete ret.__v;
    return ret;
  },
});

export const ReserveBlock = mongoose.model('ReserveBlock', reserveBlockSchema);
export default ReserveBlock;
