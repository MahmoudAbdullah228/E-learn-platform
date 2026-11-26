import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

const publicButtonVariants = cva(
  'inline-flex items-center justify-center gap-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-pointer select-none',
  {
    variants: {
      variant: {
        primary:
          'bg-primary text-on-primary hover:bg-primary-light rounded-sm px-xl py-sm text-[14px] leading-none shadow-button min-h-[40px]',
        'primary-lg':
          'bg-primary text-on-primary hover:bg-primary-light rounded-md px-xl py-md text-[16px] leading-none shadow-button min-h-[46px]',
        secondary:
          'bg-surface text-ink border border-canvas hover:border-primary hover:text-primary rounded-sm px-xl py-sm text-[14px] leading-none min-h-[40px]',
        outline:
          'bg-surface text-primary border border-primary hover:bg-primary-wash rounded-sm px-md py-xs text-[14px] leading-none min-h-[36px]',
        'link-action':
          'bg-transparent text-primary hover:text-primary-light p-0 text-[14px] font-semibold leading-[1.4] shadow-none',
      },
      fullWidth: {
        true: 'w-full',
        false: '',
      },
    },
    defaultVariants: {
      variant: 'primary',
      fullWidth: false,
    },
  },
);

export interface PublicButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof publicButtonVariants> {
  asChild?: boolean;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

export function PublicButton({
  className,
  variant,
  fullWidth,
  asChild = false,
  loading = false,
  disabled,
  leftIcon,
  rightIcon,
  children,
  type = 'button',
  ...props
}: PublicButtonProps) {
  if (asChild) {
    return (
      <Slot
        className={cn(publicButtonVariants({ variant, fullWidth, className }))}
        {...props}
      >
        {children}
      </Slot>
    );
  }

  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cn(publicButtonVariants({ variant, fullWidth, className }))}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : leftIcon}
      <span>{children}</span>
      {!loading && rightIcon}
    </button>
  );
}
