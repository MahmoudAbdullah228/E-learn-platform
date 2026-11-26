import { Button, type ButtonProps } from 'antd';
import { cn } from '@/lib/cn';

export type DashboardButtonVariant =
  | 'primary'
  | 'primary-lg'
  | 'secondary'
  | 'outline'
  | 'link-action';

export interface DashboardButtonProps extends Omit<ButtonProps, 'variant' | 'type'> {
  variant?: DashboardButtonVariant;
  fullWidth?: boolean;
}

export function DashboardButton({
  variant = 'primary',
  fullWidth = false,
  className,
  ...props
}: DashboardButtonProps) {
  const antType: ButtonProps['type'] =
    variant === 'primary' || variant === 'primary-lg'
      ? 'primary'
      : variant === 'link-action'
        ? 'link'
        : 'default';

  const antSize: ButtonProps['size'] = variant === 'primary-lg' ? 'large' : 'middle';

  const variantClasses: Record<DashboardButtonVariant, string> = {
    primary: 'rounded-sm font-semibold shadow-button',
    'primary-lg': 'rounded-md font-semibold shadow-button text-[16px]',
    secondary: 'rounded-sm font-semibold bg-surface text-ink border-canvas',
    outline:
      'rounded-sm font-semibold bg-surface text-primary border-primary hover:bg-primary-wash',
    'link-action': 'p-0 h-auto font-semibold text-primary hover:text-primary-light shadow-none',
  };

  return (
    <Button
      type={antType}
      size={antSize}
      block={fullWidth}
      className={cn(variantClasses[variant], className)}
      {...props}
    />
  );
}
