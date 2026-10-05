import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Logo } from '@/components/Logo';

/** Centered card layout shared by login, invitation, password and verification pages. */
export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <div className="grid-lines grid min-h-dvh place-items-center px-5 py-10">
      <div className="w-full max-w-sm">
        <Link to="/" className="mb-8 flex justify-center">
          <Logo size="lg" />
        </Link>
        <div className="space-y-5 rounded-3xl border border-line bg-surface/85 p-7 shadow-2xl backdrop-blur">
          <div>
            <h1 className="text-xl font-bold">{title}</h1>
            {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
