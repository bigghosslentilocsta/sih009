/**
 * Deterministic PRNG (mulberry32) + helpers.
 *
 * The operational seed must be reproducible: re-running it produces the same
 * fleet and the same history, so screenshots, tests and the risk model stay
 * stable between runs.
 */

/** @returns {() => number} generator in [0, 1) */
export function makeRng(seed = 20260929) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Uniform float in [min, max). */
export const between = (rng, min, max) => min + rng() * (max - min);

/** Uniform integer in [min, max]. */
export const intBetween = (rng, min, max) => Math.floor(between(rng, min, max + 1));

/** Pick one element. */
export const pick = (rng, list) => list[Math.floor(rng() * list.length)];

/** Round to `digits` decimal places. */
export const round = (value, digits = 2) => {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
};

/** Add `days` (may be negative) to a date and return midnight UTC. */
export const addDays = (date, days) => {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(0, 0, 0, 0);
  return d;
};

/** Midnight UTC of the current day. */
export const startOfToday = () => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
};
