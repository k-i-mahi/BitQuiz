import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { adminsRouter } from './admins/routes';
import { answersRouter } from './answers/routes';
import { authRouter } from './auth/routes';
import { competitionsRouter } from './competitions/routes';
import { env, isProduction } from './env';
import { prisma } from './lib/db';
import { errorHandler, notFoundHandler } from './lib/errors';
import { apiLimiter } from './lib/rateLimit';
import { participantsRouter } from './participants/routes';

const here = path.dirname(fileURLToPath(import.meta.url));

export function createApp(): Express {
  const app = express();

  // Railway / Caddy / any reverse proxy sits in front; needed for correct client IPs in rate limits.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'default-src': ["'self'"],
          'script-src': ["'self'"],
          // Motion and the code highlighter set inline style attributes.
          'style-src': ["'self'", "'unsafe-inline'"],
          'img-src': ["'self'", 'data:'],
          'font-src': ["'self'", 'data:'],
          'connect-src': ["'self'", 'ws:', 'wss:'],
          'upgrade-insecure-requests': isProduction ? [] : null,
        },
      },
      // Served over plain HTTP in LAN mode; only send HSTS in production behind HTTPS.
      strictTransportSecurity: isProduction,
    }),
  );

  // Reports which commit is running (Render sets RENDER_GIT_COMMIT), handy for checking a deploy went out.
  const commit = process.env.RENDER_GIT_COMMIT?.slice(0, 7) ?? process.env.GIT_COMMIT?.slice(0, 7) ?? 'local';
  app.get('/healthz', (_req, res) => {
    res.json({ status: 'ok', commit });
  });

  app.get('/readyz', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: 'ready' });
    } catch {
      res.status(503).json({ status: 'database unavailable' });
    }
  });

  const api = express.Router();
  api.use(express.json({ limit: '2mb' }));
  api.use(apiLimiter);
  api.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  api.use('/auth', authRouter);
  api.use('/admins', adminsRouter);
  api.use('/competitions', competitionsRouter);
  api.use('/answers', answersRouter);
  api.use('/', participantsRouter);
  api.use(notFoundHandler);
  app.use('/api', api);

  const webDist = env.WEB_DIST ?? path.resolve(here, '../../web/dist');
  if (existsSync(webDist)) {
    app.use(
      express.static(webDist, {
        index: false,
        setHeaders: (res, filePath) => {
          // Hashed asset files never change; everything else must be revalidated.
          if (filePath.includes(`${path.sep}assets${path.sep}`)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          }
        },
      }),
    );
    // Single-page app: every other GET serves index.html and the client router takes over.
    app.get(/^\/(?!api\/|socket\.io\/).*/, (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(webDist, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}
