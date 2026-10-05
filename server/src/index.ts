import { createServer } from 'node:http';
import { createApp } from './app';
import { cancelAllTimers, recoverTimers } from './engine/timers';
import { env } from './env';
import { prisma } from './lib/db';
import { logger } from './lib/logger';
import { closeRealtime, initRealtime } from './realtime/hub';

async function main() {
  await prisma.$connect();

  const app = createApp();
  const server = createServer(app);
  initRealtime(server);
  await recoverTimers();

  server.listen(env.PORT, () => {
    logger.info({ port: env.PORT, publicUrl: env.PUBLIC_URL }, 'BitQuiz server listening');
  });

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Shutting down');
    // State lives in the database; timers are re-armed by recoverTimers() on the next start.
    cancelAllTimers();
    await closeRealtime();
    server.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'Unhandled promise rejection');
});

main().catch((error) => {
  logger.fatal({ err: error }, 'Failed to start');
  process.exit(1);
});
