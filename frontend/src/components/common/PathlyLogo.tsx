import { Link } from 'react-router-dom';
import { cn } from '@/lib/cn';

interface PathlyLogoProps {
  variant?: 'default' | 'inverted';
  size?: 'sm' | 'md' | 'lg';
  to?: string;
  className?: string;
}

export function PathlyLogo({
  variant = 'default',
  size = 'md',
  to = '/',
  className,
}: PathlyLogoProps) {
  const isInverted = variant === 'inverted';

  const iconSizes = {
    sm: 'h-7 w-7',
    md: 'h-8 w-8',
    lg: 'h-9 w-9',
  };

  const textSizes = {
    sm: 'text-[18px]',
    md: 'text-[20px]',
    lg: 'text-[22px]',
  };

  const content = (
    <span className={cn('inline-flex items-center gap-xs select-none', className)}>
      <svg
        className={cn(iconSizes[size], 'shrink-0')}
        viewBox="0 0 36 36"
        fill="none"
        aria-hidden="true"
      >
        <rect
          width="36"
          height="36"
          rx="8"
          fill={isInverted ? 'rgba(255, 255, 255, 0.16)' : '#088395'}
        />
        <path
          d="M18 9L6 15L18 21L30 15L18 9Z"
          stroke="#FFFFFF"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M10 17.5V23.5C10 25.1569 13.5817 27 18 27C22.4183 27 26 25.1569 26 23.5V17.5"
          stroke="#FFFFFF"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M30 15V22"
          stroke="#FFFFFF"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      </svg>
      <span
        className={cn(
          'font-bold tracking-tight leading-none',
          textSizes[size],
          isInverted ? 'text-on-primary' : 'text-ink',
        )}
      >
        Pathly
      </span>
    </span>
  );

  if (!to) {
    return content;
  }

  return (
    <Link to={to} className="inline-flex items-center focus:outline-none">
      {content}
    </Link>
  );
}
