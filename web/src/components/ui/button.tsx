import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45 select-none',
  {
    variants: {
      variant: {
        primary:
          'bg-accent text-bg shadow-[0_0_0_1px_rgb(34_211_238/0.4),0_8px_24px_-8px_rgb(34_211_238/0.5)] hover:bg-accent-strong',
        secondary: 'border border-line-strong bg-surface-2 text-fg hover:border-accent/50 hover:bg-surface-3',
        ghost: 'text-muted hover:bg-surface-2 hover:text-fg',
        danger: 'border border-bad/40 bg-bad-soft text-bad hover:bg-bad/20',
        warn: 'border border-warn/40 bg-warn/10 text-warn hover:bg-warn/20',
      },
      size: {
        sm: 'h-8 px-3 text-sm',
        md: 'h-10 px-4 text-sm',
        lg: 'h-12 px-6 text-base',
        xl: 'h-16 px-8 text-lg',
        icon: 'size-9',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, disabled, children, type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  ),
);
Button.displayName = 'Button';

export { buttonVariants };
