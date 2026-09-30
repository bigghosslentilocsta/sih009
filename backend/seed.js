/**
 * Database seed script.
 *
 * On first boot (no administrator in the database) this creates the default
 * MOIL admin account. It is idempotent - safe to run on every start.
 *
 *   npm run seed     # run it manually
 *   npm start        # also runs automatically via server.js
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { connectDB, disconnectDB } from './src/config/db.js';
import { env } from './src/config/env.js';
import { ROLES } from './src/config/roles.js';
import User from './src/models/User.model.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Create the default administrator when none exists.
 * @returns {Promise<{created: boolean, email: string, password?: string}>}
 */
export async function seedAdmin() {
  const email = env.admin.email.toLowerCase().trim();

  const existingAdmin = await User.findOne({ role: ROLES.ADMIN });
  if (existingAdmin) {
    console.log(`[seed] Administrator already present (${existingAdmin.email}) - nothing to do.`);
    return { created: false, email: existingAdmin.email };
  }

  // A user may exist under this email with a different role - promote rather
  // than fail, so a re-seed always converges on a usable admin.
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    existingUser.role = ROLES.ADMIN;
    existingUser.isActive = true;
    await existingUser.save();
    console.log(`[seed] Promoted existing user ${email} to administrator.`);
    return { created: false, email, promoted: true };
  }

  const admin = await User.create({
    fullName: env.admin.fullName,
    email,
    password: env.admin.password,
    role: ROLES.ADMIN,
    designation: 'System Administrator',
    isActive: true,
  });

  console.log('');
  console.log('  ============================================================');
  console.log('   DEFAULT ADMINISTRATOR CREATED');
  console.log('  ============================================================');
  console.log(`   Email:    ${admin.email}`);
  console.log(`   Password: ${env.admin.password}`);
  console.log('  ============================================================');
  if (!process.env.ADMIN_PASSWORD) {
    console.log('   [WARNING] This is the well-known development default.');
    console.log('             Set ADMIN_PASSWORD in .env and change it after first login.');
  }
  console.log('');

  return { created: true, email: admin.email, password: env.admin.password };
}

/** CLI entry point. */
async function main() {
  try {
    await connectDB();
    await seedAdmin();
  } catch (err) {
    console.error('[seed] Failed:', err.message);
    process.exitCode = 1;
  } finally {
    await disconnectDB();
  }
}

// Only run when executed directly (`node seed.js`), not when imported.
const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]).replace(/\\/g, '/') === __filename.replace(/\\/g, '/');

if (isDirectRun) {
  main();
}
