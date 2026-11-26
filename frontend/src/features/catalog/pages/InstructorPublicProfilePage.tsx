import { ExternalLink, User } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { PublicErrorStateCard, PublicSkeleton } from '@/components/public';
import { useGetPublicInstructorQuery } from '@/features/catalog/catalogApi';
import { parseApiError } from '@/lib/apiError';

export function InstructorPublicProfilePage() {
  const { instructorId = '' } = useParams();
  const navigate = useNavigate();

  const { data, isLoading, isError, error, refetch } = useGetPublicInstructorQuery(
    instructorId,
    { skip: !instructorId },
  );

  if (isLoading) {
    return (
      <div className="mx-auto max-w-[900px] px-md py-xxl space-y-lg">
        <PublicSkeleton className="h-56 rounded-xxl" />
      </div>
    );
  }

  const instructor = data?.data?.instructor;

  if (isError || !instructor) {
    const parsed = parseApiError(error, 'Instructor profile was not found.');
    return (
      <div className="mx-auto max-w-[680px] px-md py-section">
        <PublicErrorStateCard
          title={
            parsed.status === 404 ? 'Instructor Not Found' : 'Unable to load instructor'
          }
          message={parsed.message}
          onRetry={parsed.status === 404 ? () => navigate('/courses') : () => refetch()}
          retryLabel={parsed.status === 404 ? 'Browse Courses' : 'Try Again'}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[900px] px-md md:px-xxl py-xxl space-y-xl">
      <section className="bg-surface rounded-xxl p-xxl md:p-xxxl shadow-raised border border-hairline space-y-xl">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-xl">
          <div className="h-24 w-24 rounded-full ring-2 ring-primary-light overflow-hidden bg-primary-tint flex items-center justify-center shrink-0">
            {instructor.avatarUrl ? (
              <img
                src={instructor.avatarUrl}
                alt={instructor.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <User className="h-10 w-10 text-primary" aria-hidden="true" />
            )}
          </div>

          <div className="space-y-xxs">
            <span className="text-[12px] font-bold uppercase tracking-[0.06em] text-primary">
              Pathly Instructor
            </span>
            <h1 className="text-[32px] font-bold leading-[1.25] text-ink">
              {instructor.name}
            </h1>
            <p className="text-[16px] font-semibold text-primary">
              {instructor.expertise}
            </p>
          </div>
        </div>

        <div className="space-y-xs pt-lg border-t border-hairline">
          <h2 className="text-[18px] font-semibold text-ink">About</h2>
          <p className="text-[16px] leading-[1.6] text-ink-secondary whitespace-pre-line">
            {instructor.bio}
          </p>
        </div>

        {instructor.links.length > 0 && (
          <div className="space-y-sm pt-lg border-t border-hairline">
            <div className="flex items-center justify-between gap-xs flex-wrap">
              <h2 className="text-[18px] font-semibold text-ink">Links</h2>
              <span className="text-[12px] text-ink-muted">
                Instructor-provided external links
              </span>
            </div>
            <div className="flex flex-wrap gap-sm">
              {instructor.links.map((link) => (
                <a
                  key={link.url}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-xs rounded-md bg-surface-muted hover:bg-primary-wash border border-border hover:border-primary px-md py-xs text-[14px] font-medium text-ink hover:text-primary transition-colors"
                >
                  <span>{link.label}</span>
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
