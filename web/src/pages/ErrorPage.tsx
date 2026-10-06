import { isRouteErrorResponse, Link, useRouteError } from 'react-router';
import { RefreshCw } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';

/**
 * Shown when a page fails to render or its code can't be loaded. After a new deploy, an open
 * tab may ask for files that no longer exist; reloading fetches the current version.
 */
export function ErrorPage() {
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  const staleBundle =
    error instanceof Error && /dynamically imported module|Failed to fetch|Importing a module/i.test(error.message);

  return (
    <div className="grid min-h-dvh place-items-center px-5 text-center">
      <div className="max-w-md">
        <Logo className="mb-8" />
        <h1 className="text-3xl font-bold">
          {notFound ? 'Page not found' : staleBundle ? 'A new version is available' : 'Something went wrong'}
        </h1>
        <p className="mt-3 text-muted">
          {notFound
            ? "This page doesn't exist."
            : staleBundle
              ? 'BitQuiz was updated while this page was open. Reload to continue.'
              : 'The page hit an unexpected problem. Reloading usually fixes it; your quiz data is safe on the server.'}
        </p>
        <div className="mt-6 flex justify-center gap-3">
          {!notFound && (
            <Button variant="primary" onClick={() => window.location.reload()}>
              <RefreshCw className="size-4" aria-hidden /> Reload
            </Button>
          )}
          <Link to="/" className="inline-flex h-10 items-center rounded-xl px-4 text-sm text-muted hover:text-fg">
            Go to start page
          </Link>
        </div>
      </div>
    </div>
  );
}
