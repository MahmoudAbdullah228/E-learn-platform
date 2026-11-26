import { Card, Space } from 'antd';
import { Link, useNavigate } from 'react-router-dom';
import { useAppDispatch } from '@/app/hooks';
import {
  DashboardButton,
  DashboardEmptyState,
  DashboardErrorState,
  DashboardSkeleton,
  StatusBadge,
} from '@/components/dashboard';
import { authApi } from '@/features/auth/authApi';
import { useGetMyInstructorApplicationQuery } from '@/features/instructorApplication/instructorApplicationApi';
import { parseApiError } from '@/lib/apiError';

export default function ApplicationStatusPage() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();

  const { data, isLoading, isError, error, refetch } =
    useGetMyInstructorApplicationQuery(undefined, {
      refetchOnMountOrArgChange: true,
    });

  if (isLoading) {
    return <DashboardSkeleton rows={5} />;
  }

  if (isError) {
    return (
      <DashboardErrorState
        message={parseApiError(error).message}
        onRetry={() => refetch()}
      />
    );
  }

  const application = data?.data?.application ?? null;

  if (!application) {
    return (
      <DashboardEmptyState
        title="No instructor application yet"
        description="Apply to become an instructor to start creating and selling courses on Pathly."
        actionLabel="Apply Now"
        onAction={() => navigate('/instructor/apply')}
      />
    );
  }

  const handleEnterStudio = async () => {
    await dispatch(
      authApi.endpoints.getMe.initiate(undefined, { forceRefetch: true }),
    );
    navigate('/instructor/dashboard');
  };

  return (
    <div className="max-w-[780px] space-y-lg">
      <div>
        <span className="text-[12px] font-bold uppercase tracking-[0.06em] text-primary">
          Instructor Onboarding
        </span>
        <h1 className="text-[24px] font-bold text-ink mt-xxs">
          Application Status
        </h1>
      </div>

      <Card className="rounded-xxl shadow-card border-hairline" styles={{ body: { padding: 24 } }}>
        <div className="space-y-lg">
          <div className="flex flex-wrap items-center justify-between gap-md">
            <div>
              <p className="text-[12px] text-ink-muted m-0">
                Submitted {new Date(application.createdAt).toLocaleDateString()}
              </p>
              <h2 className="text-[18px] font-semibold text-ink mt-xxs mb-0">
                {application.expertise}
              </h2>
            </div>
            <StatusBadge label={application.status} />
          </div>

          <p className="text-[14px] text-ink-secondary whitespace-pre-line m-0">
            {application.bio}
          </p>

          {application.status === 'pending' && (
            <div className="rounded-md bg-primary-wash border border-primary-soft p-md text-[14px] text-ink">
              Your application is currently under review by an administrator.
            </div>
          )}

          {application.status === 'rejected' && (
            <div className="space-y-md">
              <div className="rounded-md bg-error-bg border border-error/30 p-md text-[14px] text-error">
                <strong>Rejection reason:</strong>{' '}
                {application.rejectionReason ?? 'No reason provided.'}
              </div>
              <Link to="/instructor/apply">
                <DashboardButton variant="primary">
                  Submit a New Application
                </DashboardButton>
              </Link>
            </div>
          )}

          {application.status === 'approved' && (
            <Space wrap>
              <DashboardButton variant="primary" onClick={handleEnterStudio}>
                Go to Instructor Studio
              </DashboardButton>
            </Space>
          )}
        </div>
      </Card>
    </div>
  );
}
