import { useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

const RELOADED_KEY = 'bitquiz:reloaded-for';

function alreadyReloadedFor(buildId: string): boolean {
  try {
    return sessionStorage.getItem(RELOADED_KEY) === buildId;
  } catch {
    return false;
  }
}

function reloadFor(buildId: string) {
  try {
    sessionStorage.setItem(RELOADED_KEY, buildId);
  } catch {
    // Without storage we still reload; the loop guard just can't apply.
  }
  window.location.reload();
}

/**
 * True when the server is serving a newer web build than the one running in this tab, e.g. the
 * page was opened before a deploy. Old code must not drive a newer server.
 */
export function isOutdated(serverBuildId: string | null | undefined): serverBuildId is string {
  return Boolean(serverBuildId && __BUILD_ID__ !== 'dev' && serverBuildId !== __BUILD_ID__);
}

/**
 * Reloads an outdated page automatically once it is safe (e.g. not while a participant is
 * answering). Each server build triggers at most one automatic reload per tab, so a stale cache
 * can never cause a reload loop; after that the banner asks for a manual reload.
 */
export function useAutoUpdate(serverBuildId: string | null | undefined, safeToReload: boolean): boolean {
  const outdated = isOutdated(serverBuildId);

  useEffect(() => {
    // Checked at the moment of reloading: the server's build id only arrives with the first update.
    if (!outdated || !safeToReload || alreadyReloadedFor(serverBuildId)) return;
    const timer = setTimeout(() => reloadFor(serverBuildId), 1200);
    return () => clearTimeout(timer);
  }, [outdated, safeToReload, serverBuildId]);

  return outdated;
}

export function UpdateBanner({ serverBuildId }: { serverBuildId: string | null | undefined }) {
  if (!isOutdated(serverBuildId)) return null;
  return (
    <div
      role="alert"
      className="fixed inset-x-0 top-0 z-50 flex flex-wrap items-center justify-center gap-3 bg-accent px-4 py-2 text-sm font-medium text-bg"
    >
      BitQuiz was updated while this page was open. Reload to continue with the latest version; nothing is lost.
      <Button size="sm" variant="secondary" onClick={() => reloadFor(serverBuildId)}>
        <RefreshCw className="size-4" aria-hidden /> Reload now
      </Button>
    </div>
  );
}
