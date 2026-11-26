import { ArrowRight, User } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/cn';

interface InstructorCardProps {
  instructorId: string;
  name: string;
  expertise?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
  showProfileLink?: boolean;
  className?: string;
}

export function InstructorCard({
  instructorId,
  name,
  expertise,
  bio,
  avatarUrl,
  showProfileLink = true,
  className,
}: InstructorCardProps) {
  return (
    <div
      className={cn(
        'bg-surface rounded-xxl p-xxl shadow-card border border-hairline flex flex-col sm:flex-row items-start gap-lg',
        className,
      )}
    >
      <div className="h-16 w-16 rounded-full ring-2 ring-primary-light overflow-hidden bg-primary-tint flex items-center justify-center shrink-0">
        {avatarUrl ? (
          <img src={avatarUrl} alt={name} className="h-full w-full object-cover" />
        ) : (
          <User className="h-7 w-7 text-primary" aria-hidden="true" />
        )}
      </div>

      <div className="space-y-xs flex-1 min-w-0">
        <div>
          <h3 className="text-[18px] font-semibold leading-[1.4] text-ink">{name}</h3>
          {expertise && (
            <p className="text-[14px] font-semibold text-primary">{expertise}</p>
          )}
        </div>
        {bio && (
          <p className="text-[14px] leading-[1.6] text-ink-secondary line-clamp-4">{bio}</p>
        )}
        {showProfileLink && (
          <div className="pt-xxs">
            <Link
              to={`/instructors/${instructorId}`}
              className="inline-flex items-center gap-xxs text-[14px] font-semibold text-primary hover:text-primary-light transition-colors"
            >
              View Instructor Profile
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
