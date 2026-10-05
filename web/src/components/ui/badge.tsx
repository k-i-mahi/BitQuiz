import type { HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold tracking-wide',
  {
    variants: {
      tone: {
        neutral: 'bg-surface-3 text-muted',
        accent: 'bg-accent-soft text-accent',
        good: 'bg-good-soft text-good',
        bad: 'bg-bad-soft text-bad',
        warn: 'bg-warn/15 text-warn',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export function Badge({
  className,
  tone,
  ...props
}: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
