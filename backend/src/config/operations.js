/**
 * Module B domain constants - equipment, statuses and sectors.
 * Mirrored by `frontend/src/config/operations.js` for display only; the API
 * remains the source of truth.
 */

export const EQUIPMENT_TYPES = Object.freeze([
  'Shovel',
  'Excavator',
  'Dumper',
  'Drill',
  'Crusher',
  'Conveyor',
]);

export const EQUIPMENT_STATUSES = Object.freeze(['active', 'maintenance', 'down']);

/** A machine is "available for production" only when active. */
export const PRODUCING_STATUSES = Object.freeze(['active']);

export const SECTORS = Object.freeze([
  { id: 'SECTOR_A', name: 'Sector A - Balaghat East' },
  { id: 'SECTOR_B', name: 'Sector B - Balaghat West' },
  { id: 'SECTOR_C', name: 'Sector C - Bharweli' },
  { id: 'SECTOR_D', name: 'Sector D - Dongarbodi' },
]);

export const SECTOR_IDS = Object.freeze(SECTORS.map((s) => s.id));

export const sectorName = (id) => SECTORS.find((s) => s.id === id)?.name ?? id;

/** Maintenance is "due soon" inside this many days. */
export const MAINTENANCE_DUE_SOON_DAYS = 7;

/** Rainfall (mm / 24h) at which extraction impact starts to bite. */
export const HEAVY_RAIN_MM = 7.5;
export const SEVERE_RAIN_MM = 25.0;
