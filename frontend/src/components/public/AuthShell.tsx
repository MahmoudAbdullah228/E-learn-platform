import { CheckCircle2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { PathlyLogo } from '@/components/common/PathlyLogo';
import { cn } from '@/lib/cn';

interface AuthShellProps {
  panelHeadline: string;
  panelSubtitle?: string;
  benefits?: string[];
  quote?: string;
  children: ReactNode;
  className?: string;
}

export function AuthShell({
  panelHeadline,
  panelSubtitle,
  benefits,
  quote,
  children,
  className,
}: AuthShellProps) {
  return (
    <div className="py-xl md:py-section px-md">
      <div
        className={cn(
          'mx-auto max-w-[1000px] bg-surface rounded-xxl shadow-raised border border-hairline overflow-hidden grid grid-cols-1 md:grid-cols-2',
          className,
        )}
      >
        {/* Teal brand panel — hidden below 768px per 04-design-system.md */}
        <div className="hidden md:flex flex-col justify-between bg-primary text-on-primary p-xxxl lg:p-section relative overflow-hidden">
          <div
            className="pointer-events-none absolute -top-16 -right-16 h-56 w-56 rounded-full bg-white/10"
            aria-hidden="true"
          />
          <div
            className="pointer-events-none absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-white/10"
            aria-hidden="true"
          />

          <div className="relative z-10 space-y-xl">
            <PathlyLogo variant="inverted" size="lg" />

            <div className="space-y-md pt-md">
              <h2 className="text-[32px] font-bold leading-[1.25] text-on-primary">
                {panelHeadline}
              </h2>
              {panelSubtitle && (
                <p className="text-[16px] leading-[1.6] text-on-primary/90">
                  {panelSubtitle}
                </p>
              )}
            </div>

            {benefits && benefits.length > 0 && (
              <ul className="space-y-sm pt-sm">
                {benefits.map((item) => (
                  <li key={item} className="flex items-start gap-sm text-[14px]">
                    <CheckCircle2 className="h-5 w-5 text-primary-soft shrink-0 mt-0.5" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {quote && (
            <blockquote className="relative z-10 pt-xl border-t border-white/15 text-[14px] text-on-primary/90 italic">
              {quote}
            </blockquote>
          )}
        </div>

        {/* White form panel */}
        <div className="p-xl md:p-xxxl lg:p-section bg-surface flex flex-col justify-center">
          <div className="md:hidden mb-xl">
            <PathlyLogo size="md" />
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
