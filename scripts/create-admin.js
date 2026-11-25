/**
 * Dedicated Admin & Staff User Provisioning Script
 *
 * Usage:
 *   node scripts/create-admin.js <email> <password> [name] [role]
 *
 * Examples:
 *   node scripts/create-admin.js "admin@bazarr360.in" "SuperSecurePass123!" "Chief Admin"
 *   node scripts/create-admin.js "moderator@bazarr360.in" "ModPass123!" "City Moderator" "MODERATOR"
 *
 * Alternatively via environment variables:
 *   ADMIN_EMAIL="admin@bazarr360.in" ADMIN_PASSWORD="Password123" node scripts/create-admin.js
 */
import 'dotenv/config';
import bcrypt from 'bcrypt';
import { prisma } from '../src/db/prisma.js';
import { logger } from '../src/config/logger.js';

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function main() {
  const email = (process.argv[2] || process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.argv[3] || process.env.ADMIN_PASSWORD || '';
  const name = (process.argv[4] || process.env.ADMIN_NAME || 'System Administrator').trim();
  const roleInput = (process.argv[5] || process.env.ADMIN_ROLE || 'ADMIN').trim().toUpperCase();

  if (!email || !emailRegex.test(email)) {
    console.error('❌ Error: A valid email address is required.');
    console.log('Usage: node scripts/create-admin.js <email> <password> [name] [role]');
    process.exit(1);
  }

  if (!password || password.length < 8) {
    console.error('❌ Error: Password must be at least 8 characters long.');
    process.exit(1);
  }

  const validRoles = ['ADMIN', 'MODERATOR'];
  if (!validRoles.includes(roleInput)) {
    console.error(`❌ Error: Role must be one of [${validRoles.join(', ')}]. Received: '${roleInput}'`);
    process.exit(1);
  }

  console.log(`\n================ ADMIN PROVISIONING ================`);
  console.log(`Target Email: ${email}`);
  console.log(`Role:         ${roleInput}`);
  console.log(`Name:         ${name}`);
  console.log(`====================================================\n`);

  const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS, 10) || 10;
  const passwordHash = await bcrypt.hash(password, saltRounds);

  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    console.log(`ℹ️ Existing user found with ID: ${existingUser.id}`);
    console.log(`Updating role to ${roleInput}, setting password, and ensuring active status...`);

    const updatedUser = await prisma.user.update({
      where: { id: existingUser.id },
      data: {
        role: roleInput,
        passwordHash,
        name: name || existingUser.name,
        isActive: true,
        deletedAt: null,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        updatedAt: true,
      },
    });

    console.log(`\n✅ Successfully updated existing user to ${roleInput}!`);
    console.log(`User ID:  ${updatedUser.id}`);
    console.log(`Email:    ${updatedUser.email}`);
    console.log(`Role:     ${updatedUser.role}`);
    console.log(`Active:   ${updatedUser.isActive}`);
  } else {
    console.log(`Creating fresh ${roleInput} account...`);

    const newUser = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name,
        role: roleInput,
        isActive: true,
        isVerifiedSeller: true,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    console.log(`\n✅ Successfully created new ${roleInput} account!`);
    console.log(`User ID:  ${newUser.id}`);
    console.log(`Email:    ${newUser.email}`);
    console.log(`Role:     ${newUser.role}`);
    console.log(`Active:   ${newUser.isActive}`);
  }

  console.log(`\n👉 You can now log in at your Admin portal using:`);
  console.log(`   Email:    ${email}`);
  console.log(`   Password: [as provided]`);
  console.log(`====================================================\n`);
}

main()
  .catch((err) => {
    logger.error({ err }, '[Script] Failed to provision admin user');
    console.error('❌ Execution error:', err.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
