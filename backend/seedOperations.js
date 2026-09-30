/**
 * Operational seed - mines plant (EquipmentLog) and production history
 * (ShiftTarget) so the Module B dashboard is populated on first boot.
 *
 * Idempotent: each step is skipped when data already exists, so this is safe
 * to run on every start (`npm run seed:ops`).
 *
 * The data is generated from a fixed PRNG seed, so the fleet and the history
 * are identical on every machine.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { connectDB, disconnectDB } from './src/config/db.js';
import { SECTORS } from './src/config/operations.js';
import EquipmentLog from './src/models/EquipmentLog.model.js';
import ReserveBlock from './src/models/ReserveBlock.model.js';
import ShiftTarget from './src/models/ShiftTarget.model.js';
import { addDays, between, intBetween, makeRng, pick, round, startOfToday } from './src/utils/random.js';

const __filename = fileURLToPath(import.meta.url);

/** How many weeks of shift history to generate. */
const HISTORY_WEEKS = 8;
/** Base tonnage target per sector per day. */
const SECTOR_TARGET_TONNES = { SECTOR_A: 260, SECTOR_B: 220, SECTOR_C: 240, SECTOR_D: 180 };

/**
 * The fleet. `status` is the *current* state; the seed deliberately leaves a
 * few machines in maintenance and one down so the bottleneck alerting has
 * something realistic to surface.
 */
const FLEET = [
  { machine_id: 'EXC-01', name: 'Hitachi EX560', type: 'Excavator', sector: 'SECTOR_A', status: 'active', hours: 6120 },
  { machine_id: 'EXC-02', name: 'Komatsu PC490', type: 'Excavator', sector: 'SECTOR_A', status: 'active', hours: 5480 },
  { machine_id: 'EXC-03', name: 'Hitachi EX560', type: 'Excavator', sector: 'SECTOR_B', status: 'active', hours: 7210 },
  { machine_id: 'EXC-04', name: 'Komatsu PC490', type: 'Excavator', sector: 'SECTOR_C', status: 'maintenance', hours: 6890, dueIn: 3, note: 'Hydraulic pump replacement' },
  { machine_id: 'SHV-01', name: 'P&H 2800', type: 'Shovel', sector: 'SECTOR_A', status: 'active', hours: 9340 },
  { machine_id: 'SHV-02', name: 'P&H 2800', type: 'Shovel', sector: 'SECTOR_B', status: 'active', hours: 8870 },
  { machine_id: 'SHV-03', name: 'Liebherr R 984 C', type: 'Shovel', sector: 'SECTOR_D', status: 'down', hours: 11250, dueIn: -2, note: 'Boom crack - awaiting weldment' },
  { machine_id: 'DMP-01', name: 'Caterpillar 777F', type: 'Dumper', sector: 'SECTOR_A', status: 'active', hours: 4980 },
  { machine_id: 'DMP-02', name: 'Caterpillar 777F', type: 'Dumper', sector: 'SECTOR_A', status: 'active', hours: 5120 },
  { machine_id: 'DMP-03', name: 'Caterpillar 777D', type: 'Dumper', sector: 'SECTOR_B', status: 'active', hours: 6740 },
  { machine_id: 'DMP-04', name: 'Bell B50D', type: 'Dumper', sector: 'SECTOR_B', status: 'maintenance', hours: 7380, dueIn: 6, note: 'Scheduled 500h service' },
  { machine_id: 'DMP-05', name: 'Caterpillar 777D', type: 'Dumper', sector: 'SECTOR_C', status: 'active', hours: 4310 },
  { machine_id: 'DMP-06', name: 'Bell B50D', type: 'Dumper', sector: 'SECTOR_C', status: 'active', hours: 5890 },
  { machine_id: 'DMP-07', name: 'Caterpillar 777F', type: 'Dumper', sector: 'SECTOR_D', status: 'active', hours: 8110 },
  { machine_id: 'DMP-08', name: 'Caterpillar 777D', type: 'Dumper', sector: 'SECTOR_D', status: 'active', hours: 9040 },
  { machine_id: 'DRL-01', name: 'Sandvik DD210', type: 'Drill', sector: 'SECTOR_A', status: 'active', hours: 3720 },
  { machine_id: 'DRL-02', name: 'Sandvik DD210', type: 'Drill', sector: 'SECTOR_C', status: 'active', hours: 4150 },
  { machine_id: 'CRS-01', name: 'Metso Nordberg', type: 'Crusher', sector: 'SECTOR_A', status: 'active', hours: 12600 },
  { machine_id: 'CNV-01', name: 'Belt Conveyor A1', type: 'Conveyor', sector: 'SECTOR_A', status: 'active', hours: 15300 },
  { machine_id: 'CNV-02', name: 'Belt Conveyor C1', type: 'Conveyor', sector: 'SECTOR_C', status: 'active', hours: 9870 },
];

/** Seed the equipment fleet. Returns how many documents were inserted. */
export async function seedEquipment() {
  const existing = await EquipmentLog.countDocuments();
  if (existing > 0) {
    console.log(`[seed:ops] Equipment already present (${existing} machines) - skipping.`);
    return 0;
  }

  const today = startOfToday();
  const docs = FLEET.map((m) => ({
    machine_id: m.machine_id,
    name: m.name,
    type: m.type,
    status: m.status,
    hours_active: m.hours,
    downtime_hours: m.status === 'down' ? intBetween(makeRng(m.hours), 48, 96) : m.status === 'maintenance' ? intBetween(makeRng(m.hours + 7), 8, 24) : 0,
    maintenance_due_date: addDays(today, m.dueIn ?? intBetween(makeRng(m.hours + 13), 18, 60)),
    last_maintenance_date: addDays(today, -(intBetween(makeRng(m.hours + 29), 20, 90))),
    sector: m.sector,
    notes: m.note ?? '',
  }));

  const inserted = await EquipmentLog.insertMany(docs);

  // Derive the failure probability with the model's own logic.
  for (const doc of inserted) {
    doc.failure_probability = doc.deriveFailureProbability();
  }
  await EquipmentLog.bulkWrite(
    inserted.map((doc) => ({
      updateOne: { filter: { _id: doc._id }, update: { $set: { failure_probability: doc.failure_probability } } },
    })),
  );

  const down = inserted.filter((d) => d.status !== 'active').length;
  console.log(`[seed:ops] Inserted ${inserted.length} machines (${down} not producing).`);
  return inserted.length;
}

/**
 * Generate `HISTORY_WEEKS` of daily shift records per sector.
 *
 * Attainment is not random noise - it is driven by the same things the risk
 * model will look at later (rainfall, downtime, weekday), so the historical
 * charts and the forecast tell a consistent story.
 */
export async function seedShiftHistory() {
  const existing = await ShiftTarget.countDocuments();
  if (existing > 0) {
    console.log(`[seed:ops] Shift history already present (${existing} records) - skipping.`);
    return 0;
  }

  const rng = makeRng(987654321);
  const today = startOfToday();
  const docs = [];

  for (let dayOffset = HISTORY_WEEKS * 7; dayOffset >= 1; dayOffset -= 1) {
    const date = addDays(today, -dayOffset);
    const dow = date.getUTCDay();
    const isSunday = dow === 0;

    // One rainfall draw per day, shared across sectors (it is one weather system).
    const rainRoll = rng();
    const isMonsoonDay = rainRoll > 0.86;
    const isHeavyDay = rainRoll > 0.95;
    const rainfall = isHeavyDay
      ? round(between(rng, 28, 62), 1)
      : isMonsoonDay
        ? round(between(rng, 8, 26), 1)
        : round(between(rng, 0, 5), 1);

    for (const sector of SECTORS) {
      const base = SECTOR_TARGET_TONNES[sector.id] ?? 200;
      const target = Math.round(base * between(rng, 0.94, 1.06));

      // Attainment baseline, then penalties.
      let attainment = between(rng, 0.94, 1.08);
      if (isSunday) attainment *= between(rng, 0.72, 0.88);
      if (rainfall >= 7.5) attainment *= 1 - Math.min(0.45, rainfall / 90);
      if (rainfall >= 25) attainment *= 0.7;

      // Occasional unplanned breakdown day.
      const breakdown = rng() > 0.94;
      if (breakdown) attainment *= between(rng, 0.45, 0.7);

      const downtime = breakdown
        ? intBetween(rng, 8, 20)
        : rainfall >= 7.5
          ? intBetween(rng, 2, 8)
          : rng() > 0.7
            ? intBetween(rng, 0, 3)
            : 0;

      attainment -= Math.min(0.12, downtime * 0.006);

      const actual = Math.max(0, Math.round(target * attainment));

      docs.push({
        date,
        sector: sector.id,
        target_tonnes: target,
        actual_tonnes: actual,
        shift: 'total',
        rainfall_mm: rainfall,
        downtime_hours: downtime,
        notes: breakdown ? 'Unplanned breakdown' : rainfall >= 25 ? 'Heavy rain - pit operations suspended' : '',
      });
    }
  }

  const inserted = await ShiftTarget.insertMany(docs);

  const totalTarget = inserted.reduce((sum, d) => sum + d.target_tonnes, 0);
  const totalActual = inserted.reduce((sum, d) => sum + d.actual_tonnes, 0);
  const attainment = ((totalActual / totalTarget) * 100).toFixed(1);

  console.log(
    `[seed:ops] Inserted ${inserted.length} shift records over ${HISTORY_WEEKS} weeks ` +
      `(overall attainment ${attainment}%).`,
  );
  return inserted.length;
}

/**
 * Seed the reserve block inventory (Module A output, consumed by Module C).
 * Idempotent - skipped when blocks already exist.
 *
 * These are **seeded reference figures**, tagged `source: "seed"`, so the
 * executive KPI is aggregated from real database records rather than a
 * hard-coded number. Replace them by importing MOIL survey records, or by
 * persisting Module A analyses with `source: "gee_analysis"`.
 */
const RESERVE_BLOCKS = [
  { block_id: 'BAL-BLK-01', name: 'Balaghat Block', state: 'Madhya Pradesh', district: 'Balaghat', area_km2: 388.2, estimated_reserve_tonnes: 96_000_000, average_grade_pct: 38.4, confidence_level: 'high', status: 'analysed', suitability_score: 47.5, notes: 'Type AB lateritic ore belt' },
  { block_id: 'BAL-BLK-02', name: 'Bharweli Block', state: 'Madhya Pradesh', district: 'Balaghat', area_km2: 592.9, estimated_reserve_tonnes: 142_500_000, average_grade_pct: 36.9, confidence_level: 'medium', status: 'analysed', suitability_score: 46.9, notes: 'Large low-grade laterite blanket' },
  { block_id: 'BAL-BLK-03', name: 'Dongarbodi Block', state: 'Madhya Pradesh', district: 'Balaghat', area_km2: 176.4, estimated_reserve_tonnes: 41_200_000, average_grade_pct: 34.2, confidence_level: 'medium', status: 'mapped', suitability_score: null, notes: 'Awaiting assay results' },
  { block_id: 'JHK-BLK-01', name: 'Gua Valley Block', state: 'Jharkhand', district: 'East Singhbhum', area_km2: 241.8, estimated_reserve_tonnes: 78_900_000, average_grade_pct: 42.1, confidence_level: 'high', status: 'analysed', suitability_score: 61.2, notes: 'Metamorphosed ore, high grade' },
  { block_id: 'ODS-BLK-01', name: 'Bonke-Khondsia Block', state: 'Odisha', district: 'Keonjhar', area_km2: 318.6, estimated_reserve_tonnes: 87_300_000, average_grade_pct: 39.8, confidence_level: 'medium', status: 'analysed', suitability_score: 52.8, notes: 'Lateritic, partially explored' },
  { block_id: 'ODS-BLK-02', name: 'Kantamal Plateau Block', state: 'Odisha', district: 'Kandhamal', area_km2: 205.1, estimated_reserve_tonnes: 39_600_000, average_grade_pct: 35.9, confidence_level: 'low', status: 'prospective', suitability_score: null, notes: 'Prospective - no drilling yet' },
];

/** Seed the reserve block inventory. */
export async function seedReserveBlocks() {
  const existing = await ReserveBlock.countDocuments();
  if (existing > 0) {
    console.log(`[seed:ops] Reserve blocks already present (${existing} blocks) - skipping.`);
    return 0;
  }

  const inserted = await ReserveBlock.insertMany(
    RESERVE_BLOCKS.map((b) => ({ ...b, source: 'seed' })),
  );

  const total = inserted.reduce((sum, b) => sum + b.estimated_reserve_tonnes, 0);
  console.log(
    `[seed:ops] Inserted ${inserted.length} reserve blocks ` +
      `(${(total / 1e6).toFixed(1)} Mt estimated).`,
  );
  return inserted.length;
}

/** Seed everything operational. */
export async function seedOperations() {
  const reserveBlocks = await seedReserveBlocks();
  const equipment = await seedEquipment();
  const shifts = await seedShiftHistory();
  return { reserveBlocks, equipment, shifts };
}

// --- CLI entry point -------------------------------------------------------
async function main() {
  try {
    await connectDB();
    await seedOperations();
  } catch (err) {
    console.error('[seed:ops] Failed:', err.message);
    process.exitCode = 1;
  } finally {
    await disconnectDB();
  }
}

const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]).replace(/\\/g, '/') === __filename.replace(/\\/g, '/');

if (isDirectRun) {
  main();
}
