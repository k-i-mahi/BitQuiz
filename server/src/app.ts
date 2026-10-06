import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type Express, type RequestHandler } from 'express';
import helmet from 'helmet';
import { teamRouter } from './team/routes';
import { answersRouter } from './answers/routes';
import { authRouter } from './auth/routes';
import { competitionsRouter } from './competitions/routes';
import { env, isProduction } from './env';
import { prisma } from './lib/db';
import { logger } from './lib/logger';
import { errorHandler, notFoundHandler } from './lib/errors';
import { apiLimiter } from './lib/rateLimit';
import { participantsRouter } from './participants/routes';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Logs failed and slow API requests (path only: query strings can carry tokens). Everything else at debug. */
const requestLog: RequestHandler = (req, res, next) => {
  const started = performance.now();
  res.on('finish', () => {
    const ms = Math.round(performance.now() - started);
    const entry = { method: req.method, path: req.baseUrl + req.path, status: res.statusCode, ms };
    if (res.statusCode >= 500) logger.error(entry, 'Request failed');
    else if (res.statusCode >= 400 && res.statusCode !== 401 && res.statusCode !== 409)
      logger.warn(entry, 'Request rejected');
    else if (ms > 1000) logger.info(entry, 'Slow request');
    else logger.debug(entry, 'Request');
  });
  next();
};

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
  api.use(requestLog);
  api.use(express.json({ limit: '2mb' }));
  api.use(apiLimiter);
  api.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  api.use('/auth', authRouter);
  api.use('/team', teamRouter);
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
    // Link-preview crawlers need absolute URLs, so the public address is filled in once at startup.
    const publicUrl = env.PUBLIC_URL.replace(/\/$/, '');
    const indexHtml = readFileSync(path.join(webDist, 'index.html'), 'utf8')
      .replace('content="/og-image.png"', `content="${publicUrl}/og-image.png"`)
      .replace(
        '<meta property="og:type"',
        `<meta property="og:url" content="${publicUrl}/" />\n    <meta property="og:type"`,
      );

    // Single-page app: every other GET serves index.html and the client router takes over.
    app.get(/^\/(?!api\/|socket\.io\/).*/, (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.type('html').send(indexHtml);
    });
  }

  app.use(errorHandler);
  return app;
}
