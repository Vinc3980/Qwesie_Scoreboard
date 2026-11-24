import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const prisma = new PrismaClient();

function randomTempPassword() {
  return crypto.randomBytes(9).toString('base64url').slice(0, 12);
}

async function main() {
  const usernameArg = process.argv.find(a => a.startsWith('--username='))?.split('=')[1];
  await prisma.$connect();

  const adminRoleUser = usernameArg
    ? await prisma.user.findFirst({ where: { username: { equals: usernameArg, mode: 'insensitive' } as any }, include: { role: true } })
    : await prisma.user.findFirst({ where: { isActive: true, role: { name: 'ADMIN' } }, include: { role: true }, orderBy: { createdAt: 'asc' } });

  if (!adminRoleUser) {
    console.error(usernameArg ? `No user found with username "${usernameArg}".` : 'No active admin user found.');
    process.exitCode = 1;
    return;
  }

  const tempPassword = randomTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 10);
  await prisma.user.update({
    where: { id: adminRoleUser.id },
    data: {
      passwordHash,
      mustChangePassword: true,
      tokenVersion: { increment: 1 },
      failedAttempts: 0,
      lockedUntil: null,
      isActive: true,
    },
  });

  console.log('Admin password reset successful.');
  console.log(`Username: ${adminRoleUser.username}`);
  console.log(`Temporary password (one-time, shown now): ${tempPassword}`);
  console.log('The user must change this password on next sign-in.');
}

main()
  .catch((e) => {
    console.error('auth:reset-admin failed:', e?.message || e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
  });

