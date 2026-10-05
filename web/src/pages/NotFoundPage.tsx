import { Link } from 'react-router';
import { Logo } from '@/components/Logo';

export function NotFoundPage() {
  return (
    <div className="grid min-h-dvh place-items-center px-5 text-center">
      <div>
        <Logo className="mb-8" />
        <h1 className="text-5xl font-bold">404</h1>
        <p className="mt-2 text-muted">This page doesn&apos;t exist.</p>
        <Link to="/" className="mt-6 inline-block text-accent hover:underline">
          Back to the start
        </Link>
      </div>
    </div>
  );
}
