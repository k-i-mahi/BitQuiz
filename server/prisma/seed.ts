/**
 * Creates the organization and the first owner account. Safe to run more than once.
 * With `--demo`, also adds a small sample competition.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomBytes, randomInt } from 'node:crypto';
import { parseQuestionCsv, QUESTION_CSV_TEMPLATE } from '@bitquiz/shared';

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.SEED_ADMIN_EMAIL ?? '').trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? '';
  const orgName = process.env.SEED_ORG_NAME?.trim() || 'IEEE CS KUET';
  if (!email || password.length < 8) {
    throw new Error('Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD (min 8 characters) before seeding.');
  }

  const slug = orgName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const organization = await prisma.organization.upsert({
    where: { slug },
    update: {},
    create: { name: orgName, slug },
  });

  const existing = await prisma.adminUser.findUnique({ where: { email } });
  if (existing) {
    console.log(`Owner ${email} already exists, leaving the password unchanged.`);
  } else {
    await prisma.adminUser.create({
      data: {
        organizationId: organization.id,
        email,
        role: 'OWNER',
        passwordHash: await bcrypt.hash(password, 12),
      },
    });
    console.log(`Created owner ${email} for ${orgName}.`);
  }

  if (process.argv.includes('--demo')) {
    const { questions } = parseQuestionCsv(QUESTION_CSV_TEMPLATE);
    const rounds = [...new Set(questions.map((q) => q.round))];
    await prisma.competition.create({
      data: {
        organizationId: organization.id,
        title: 'Demo Quiz',
        joinCode: Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[randomInt(32)]).join(''),
        projectorToken: randomBytes(24).toString('base64url'),
        rounds: {
          create: rounds.map((round) => ({
            order: round,
            title: `Round ${round}`,
            questions: {
              create: questions.filter((q) => q.round === round).map(({ round: _round, ...q }) => q),
            },
          })),
        },
      },
    });
    console.log('Created the "Demo Quiz" competition.');
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
