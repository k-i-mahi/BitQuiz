import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Spinner({ className, label = 'Loading' }: { className?: string; label?: string }) {
  return (
    <div role="status" className={cn('flex items-center justify-center gap-2 text-muted', className)}>
      <Loader2 className="size-5 animate-spin" aria-hidden />
      <span className="text-sm">{label}…</span>
    </div>
  );
}

export function FullPageSpinner({ label }: { label?: string }) {
  return (
    <div className="grid min-h-dvh place-items-center">
      <Spinner label={label} />
    </div>
  );
}
