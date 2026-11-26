import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { Card, Input } from 'antd';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DashboardButton,
  DashboardErrorState,
  DashboardInput,
  DashboardSkeleton,
  useDashboardNotify,
} from '@/components/dashboard';
import { authApi } from '@/features/auth/authApi';
import { useAppDispatch } from '@/app/hooks';
import {
  useGetMyInstructorApplicationQuery,
  useSubmitInstructorApplicationMutation,
  type InstructorLinkDto,
} from '@/features/instructorApplication/instructorApplicationApi';
import { parseApiError } from '@/lib/apiError';
import { instructorApplicationSchema } from '@/lib/validation';

export default function ApplyInstructorPage() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { message } = useDashboardNotify();

  const { data, isLoading, isError, error, refetch } =
    useGetMyInstructorApplicationQuery();
  const [submitApplication, { isLoading: isSubmitting }] =
    useSubmitInstructorApplicationMutation();

  const [expertise, setExpertise] = useState('');
  const [bio, setBio] = useState('');
  const [links, setLinks] = useState<InstructorLinkDto[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const existing = data?.data?.application ?? null;

  useEffect(() => {
    if (existing?.status === 'pending') {
      navigate('/instructor/application-status', { replace: true });
    }
  }, [existing?.status, navigate]);

  if (isLoading) {
    return <DashboardSkeleton rows={6} />;
  }

  if (isError) {
    return (
      <DashboardErrorState
        message={parseApiError(error).message}
        onRetry={() => refetch()}
      />
    );
  }

  const addLink = () => {
    if (links.length >= 5) return;
    setLinks((prev) => [...prev, { label: '', url: '' }]);
  };

  const updateLink = (index: number, key: 'label' | 'url', value: string) => {
    setLinks((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, [key]: value } : item)),
    );
  };

  const removeLink = (index: number) => {
    setLinks((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFieldErrors({});

    const cleanedLinks = links.filter(
      (l) => l.label.trim().length > 0 || l.url.trim().length > 0,
    );

    const parsed = instructorApplicationSchema.safeParse({
      expertise,
      bio,
      links: cleanedLinks,
    });

    if (!parsed.success) {
      const nextErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'form');
        if (!nextErrors[key]) nextErrors[key] = issue.message;
      }
      setFieldErrors(nextErrors);
      if (nextErrors.links) setFormError(nextErrors.links);
      return;
    }

    try {
      await submitApplication(parsed.data).unwrap();
      void message.success('Instructor application submitted!');
      navigate('/instructor/application-status', { replace: true });
    } catch (err) {
      const apiErr = parseApiError(err);
      if (apiErr.code === 'APPLICATION_ALREADY_PENDING') {
        navigate('/instructor/application-status', { replace: true });
        return;
      }
      if (apiErr.code === 'INSTRUCTOR_ALREADY_APPROVED') {
        await dispatch(
          authApi.endpoints.getMe.initiate(undefined, { forceRefetch: true }),
        );
        navigate('/instructor/dashboard', { replace: true });
        return;
      }
      if (apiErr.code === 'VALIDATION_ERROR') {
        const nextErrors: Record<string, string> = {};
        for (const d of apiErr.details) {
          const key = d.field ?? d.path;
          if (key) nextErrors[key] = d.message;
        }
        setFieldErrors(nextErrors);
      }
      setFormError(apiErr.message);
    }
  };

  return (
    <div className="max-w-[780px] space-y-lg">
      <div>
        <span className="text-[12px] font-bold uppercase tracking-[0.06em] text-primary">
          Instructor Onboarding
        </span>
        <h1 className="text-[24px] font-bold text-ink mt-xxs">
          Apply to Become an Instructor
        </h1>
        <p className="text-[14px] text-ink-secondary mt-xxs">
          Tell us about your teaching background and area of expertise. Applications are reviewed by the Pathly team.
        </p>
      </div>

      {existing?.status === 'rejected' && existing.rejectionReason && (
        <Card className="rounded-lg border-error/30 bg-error-bg">
          <p className="text-[14px] font-semibold text-error m-0">
            Previous application was rejected
          </p>
          <p className="text-[13px] text-ink mt-xxs mb-0">
            Reason: {existing.rejectionReason}
          </p>
        </Card>
      )}

      <Card className="rounded-xxl shadow-card border-hairline" styles={{ body: { padding: 24 } }}>
        {formError && (
          <div
            role="alert"
            className="mb-md rounded-md bg-error-bg border border-error/30 p-sm text-[13px] text-error"
          >
            {formError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-lg">
          <DashboardInput
            label="Area of Expertise"
            placeholder="e.g. Full-Stack TypeScript & Cloud Architecture"
            value={expertise}
            onChange={(e) => setExpertise(e.target.value)}
            error={fieldErrors.expertise}
            helperText="2 to 200 characters."
          />

          <div className="space-y-xxs">
            <label className="block text-[14px] font-semibold text-ink">
              Instructor Bio
            </label>
            <Input.TextArea
              rows={5}
              placeholder="Share your experience, teaching style, and what learners will gain from your courses..."
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              status={fieldErrors.bio ? 'error' : undefined}
              className="rounded-md"
            />
            {fieldErrors.bio ? (
              <p className="text-[12px] text-error m-0" role="alert">
                {fieldErrors.bio}
              </p>
            ) : (
              <p className="text-[12px] text-ink-muted m-0">
                50 to 2000 characters ({bio.trim().length}/2000).
              </p>
            )}
          </div>

          <div className="space-y-sm">
            <div className="flex items-center justify-between gap-sm">
              <div>
                <p className="text-[14px] font-semibold text-ink m-0">
                  Portfolio &amp; Social Links (Optional)
                </p>
                <p className="text-[12px] text-ink-muted m-0">
                  Up to 5 unique HTTPS links (e.g. GitHub, LinkedIn, website).
                </p>
              </div>
              <DashboardButton
                variant="outline"
                size="small"
                icon={<PlusOutlined />}
                disabled={links.length >= 5}
                onClick={addLink}
              >
                Add Link
              </DashboardButton>
            </div>

            {links.map((link, index) => (
              <div
                key={index}
                className="grid grid-cols-1 sm:grid-cols-12 gap-sm items-start bg-surface-subtle p-sm rounded-md border border-border"
              >
                <div className="sm:col-span-4">
                  <Input
                    placeholder="Label (e.g. GitHub)"
                    value={link.label}
                    onChange={(e) => updateLink(index, 'label', e.target.value)}
                  />
                </div>
                <div className="sm:col-span-7">
                  <Input
                    placeholder="https://github.com/username"
                    value={link.url}
                    onChange={(e) => updateLink(index, 'url', e.target.value)}
                  />
                </div>
                <div className="sm:col-span-1 flex justify-end">
                  <DashboardButton
                    variant="secondary"
                    size="small"
                    icon={<DeleteOutlined />}
                    onClick={() => removeLink(index)}
                    aria-label="Remove link"
                  />
                </div>
              </div>
            ))}
          </div>

          <DashboardButton
            htmlType="submit"
            variant="primary-lg"
            loading={isSubmitting}
          >
            Submit Application
          </DashboardButton>
        </form>
      </Card>
    </div>
  );
}
