import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { Card, Input } from 'antd';
import { useState } from 'react';
import { useAppSelector } from '@/app/hooks';
import {
  DashboardButton,
  DashboardErrorState,
  DashboardInput,
  DashboardSkeleton,
  useDashboardNotify,
} from '@/components/dashboard';
import {
  useGetPublicInstructorQuery,
  type PublicInstructorProfile,
} from '@/features/catalog/catalogApi';
import type { InstructorLinkDto } from '@/features/instructorApplication/instructorApplicationApi';
import { useUpdateInstructorProfileMutation } from '@/features/instructorCourses/instructorCoursesApi';
import { parseApiError } from '@/lib/apiError';
import { instructorApplicationSchema } from '@/lib/validation';

function InstructorProfileForm({
  profile,
}: {
  profile: PublicInstructorProfile | null;
}) {
  const { message } = useDashboardNotify();
  const [updateProfile, { isLoading }] = useUpdateInstructorProfileMutation();

  const [expertise, setExpertise] = useState(profile?.expertise ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [links, setLinks] = useState<InstructorLinkDto[]>(profile?.links ?? []);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const handleSave = async (e: React.FormEvent) => {
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
      await updateProfile(parsed.data).unwrap();
      void message.success('Public instructor profile updated.');
    } catch (err) {
      const apiErr = parseApiError(err);
      setFormError(apiErr.message);
    }
  };

  return (
    <Card className="rounded-xxl shadow-card border-hairline" styles={{ body: { padding: 24 } }}>
      {formError && (
        <div
          role="alert"
          className="mb-md rounded-md bg-error-bg border border-error/30 p-sm text-[13px] text-error"
        >
          {formError}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-lg">
        <DashboardInput
          label="Expertise"
          value={expertise}
          onChange={(e) => setExpertise(e.target.value)}
          error={fieldErrors.expertise}
        />

        <div className="space-y-xxs">
          <label className="block text-[14px] font-semibold text-ink">Bio</label>
          <Input.TextArea
            rows={5}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            status={fieldErrors.bio ? 'error' : undefined}
          />
          {fieldErrors.bio && (
            <p className="text-[12px] text-error m-0">{fieldErrors.bio}</p>
          )}
        </div>

        <div className="space-y-sm">
          <div className="flex items-center justify-between">
            <span className="text-[14px] font-semibold text-ink">
              Links ({links.length}/5)
            </span>
            <DashboardButton
              variant="outline"
              size="small"
              icon={<PlusOutlined />}
              disabled={links.length >= 5}
              onClick={() =>
                setLinks((prev) => [...prev, { label: '', url: '' }])
              }
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
                  placeholder="Label"
                  value={link.label}
                  onChange={(e) =>
                    setLinks((prev) =>
                      prev.map((item, idx) =>
                        idx === index ? { ...item, label: e.target.value } : item,
                      ),
                    )
                  }
                />
              </div>
              <div className="sm:col-span-7">
                <Input
                  placeholder="https://..."
                  value={link.url}
                  onChange={(e) =>
                    setLinks((prev) =>
                      prev.map((item, idx) =>
                        idx === index ? { ...item, url: e.target.value } : item,
                      ),
                    )
                  }
                />
              </div>
              <div className="sm:col-span-1 flex justify-end">
                <DashboardButton
                  variant="secondary"
                  size="small"
                  icon={<DeleteOutlined />}
                  onClick={() =>
                    setLinks((prev) => prev.filter((_, idx) => idx !== index))
                  }
                />
              </div>
            </div>
          ))}
        </div>

        <DashboardButton htmlType="submit" variant="primary-lg" loading={isLoading}>
          Save Instructor Profile
        </DashboardButton>
      </form>
    </Card>
  );
}

export default function InstructorProfilePage() {
  const user = useAppSelector((state) => state.auth.user);

  const { data, isLoading, isError, error, refetch } =
    useGetPublicInstructorQuery(user?.id ?? '', {
      skip: !user?.id,
    });

  if (isLoading) {
    return <DashboardSkeleton rows={6} />;
  }

  const parsedError = isError ? parseApiError(error) : null;
  if (isError && parsedError?.status !== 404) {
    return (
      <DashboardErrorState
        message={parsedError?.message ?? 'Unable to load instructor profile.'}
        onRetry={() => refetch()}
      />
    );
  }

  const profile = data?.data?.instructor ?? null;

  return (
    <div className="max-w-[780px] space-y-lg">
      <div>
        <span className="text-[12px] font-bold uppercase tracking-[0.06em] text-primary">
          Public Presence
        </span>
        <h1 className="text-[24px] font-bold text-ink mt-xxs">
          Instructor Profile
        </h1>
        <p className="text-[14px] text-ink-secondary mt-xxs">
          This information appears on your published courses and public instructor profile.
        </p>
      </div>

      <InstructorProfileForm
        key={profile ? profile.id + profile.expertise : 'incomplete'}
        profile={profile}
      />
    </div>
  );
}
