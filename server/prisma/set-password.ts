/**
 * Sets a new password for an organizer account directly in the database. Use it when email is
 * not configured and someone (including the owner) is locked out.
 *
 *   npm run admin:set-password -w server -- you@example.com
 *
 * It asks for the new password. The database is taken from DATABASE_URL/DIRECT_URL (../.env, or
 * your production values set in the shell). All existing sessions of the account are signed out.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { createInterface } from 'node:readline';
import { stdin, stdout } from 'node:process';
import { passwordSchema } from '@bitquiz/shared';

const prisma = new PrismaClient();

async function main() {
  const email = (process.argv[2] ?? '').trim().toLowerCase();
  if (!email) throw new Error('Usage: npm run admin:set-password -w server -- <email>');

  const admin = await prisma.adminUser.findUnique({ where: { email } });
  if (!admin) throw new Error(`No organizer account with email ${email}`);

  // Read line by line so it works both when typed and when piped in.
  const rl = createInterface({ input: stdin });
  const lines = rl[Symbol.asyncIterator]();
  const ask = async (prompt: string) => {
    stdout.write(prompt);
    const next = await lines.next();
    if (next.done) throw new Error('No input received');
    return next.value;
  };
  const password = await ask(`New password for ${email} (at least 8 characters): `);
  const repeat = await ask('\nRepeat the password: ');
  stdout.write('\n');
  rl.close();

  const valid = passwordSchema.safeParse(password);
  if (!valid.success) throw new Error(valid.error.issues[0]?.message ?? 'Invalid password');
  if (password !== repeat) throw new Error("The passwords don't match");

  await prisma.adminUser.update({
    where: { id: admin.id },
    data: {
      passwordHash: await bcrypt.hash(password, 12),
      sessionVersion: { increment: 1 },
      status: 'ACTIVE',
    },
  });
  console.log(`Password updated for ${email}. Existing sessions were signed out.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
