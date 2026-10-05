import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { ERROR_CODES, createAdminSchema } from '@bitquiz/shared';
import { BCRYPT_ROUNDS } from '../auth/routes';
import { adminOf, requireAdmin, requireOwner } from '../auth/session';
import { isUniqueViolation, prisma } from '../lib/db';
import { HttpError, badRequest, idParam, notFound, parse } from '../lib/errors';

export const adminsRouter = Router();

adminsRouter.use(requireAdmin, requireOwner);

adminsRouter.get('/', async (req, res) => {
  const admins = await prisma.adminUser.findMany({
    where: { organizationId: adminOf(req).organizationId },
    select: { id: true, email: true, role: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  res.json(admins);
});

adminsRouter.post('/', async (req, res) => {
  const input = parse(createAdminSchema, req.body);
  try {
    const created = await prisma.adminUser.create({
      data: {
        organizationId: adminOf(req).organizationId,
        email: input.email,
        role: input.role,
        passwordHash: await bcrypt.hash(input.password, BCRYPT_ROUNDS),
      },
      select: { id: true, email: true, role: true, createdAt: true },
    });
    res.status(201).json(created);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new HttpError(409, ERROR_CODES.VALIDATION, 'An admin with this email already exists');
    }
    throw error;
  }
});

adminsRouter.delete('/:id', async (req, res) => {
  const me = adminOf(req);
  const id = idParam(req.params.id, 'Admin');
  if (id === me.id) throw badRequest('You cannot remove your own account');
  const { count } = await prisma.adminUser.deleteMany({
    where: { id, organizationId: me.organizationId },
  });
  if (count === 0) throw notFound('Admin');
  res.status(204).end();
});
