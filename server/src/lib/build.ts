import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../env';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Folder of the built web app that this server serves. */
export function webDistPath(): string {
  return env.WEB_DIST ?? path.resolve(here, '../../../web/dist');
}

let cached: string | null | undefined;

/**
 * Id of the web build being served (from build.json written by the Vite build), or null when no
 * build is present, as in development. Screens compare it with their own build to detect a deploy.
 */
export function webBuildId(): string | null {
  if (cached !== undefined) return cached;
  try {
    const file = path.join(webDistPath(), 'build.json');
    cached = existsSync(file)
      ? ((JSON.parse(readFileSync(file, 'utf8')) as { buildId?: string }).buildId ?? null)
      : null;
  } catch {
    cached = null;
  }
  return cached;
}
