import pino from 'pino';
import { env, isProduction } from '../env';

export const logger = pino({
  level: env.NODE_ENV === 'test' ? 'silent' : env.LOG_LEVEL,
  base: { service: 'bitquiz' },
  redact: ['req.headers.cookie', 'req.headers.authorization', 'password', 'token'],
  ...(isProduction
    ? {}
    : { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss.l' } } }),
});
