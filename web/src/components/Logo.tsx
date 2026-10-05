import { cn } from '@/lib/utils';

export function Logo({ className, size = 'md' }: { className?: string; size?: 'sm' | 'md' | 'lg' }) {
  const text = { sm: 'text-lg', md: 'text-xl', lg: 'text-4xl' }[size];
  return (
    <span className={cn('inline-flex items-center gap-2 font-display font-bold', text, className)}>
      <svg viewBox="0 0 64 64" className="size-[1.25em]" aria-hidden>
        <rect width="64" height="64" rx="14" fill="#0b1224" stroke="#233052" />
        <path
          d="M18 14h17a11 11 0 0 1 4.6 21A11.5 11.5 0 0 1 35.5 52H18Z"
          fill="none"
          stroke="#22d3ee"
          strokeWidth="6"
          strokeLinejoin="round"
        />
        <circle cx="44" cy="46" r="5" fill="#f59e0b" />
      </svg>
      <span>
        Bit<span className="text-accent">Quiz</span>
      </span>
    </span>
  );
}
