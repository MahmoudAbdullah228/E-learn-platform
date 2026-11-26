import { ArrowLeftOutlined, SendOutlined } from '@ant-design/icons';
import { Alert, Card, Input, InputNumber, Select, Space } from 'antd';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  DashboardButton,
  DashboardErrorState,
  DashboardInput,
  DashboardSkeleton,
  StatusBadge,
  useDashboardNotify,
} from '@/components/dashboard';
import { useListPublicCategoriesQuery } from '@/features/catalog/catalogApi';
import {
  useDiscardPublishedCourseRevisionMutation,
  useGetPublishedCourseRevisionQuery,
  useListRevisionSectionsQuery,
  useReopenPublishedCourseRevisionMutation,
  useSubmitPublishedCourseRevisionMutation,
  useUpdateRevisionMetadataMutation,
} from '@/features/instructorCourses/courseRevisionsApi';
import type { CourseLanguage, CourseLevel } from '@/features/instructorCourses/instructorCoursesApi';
import { parseApiError } from '@/lib/apiError';
import { formatEgpPrice } from '@/lib/formatters';

export default function InstructorRevisionEditorPage() {
  const { courseId = '', revisionId = '' } = useParams();
  const navigate = useNavigate();
  const { message } = useDashboardNotify();

  const revisionQuery = useGetPublishedCourseRevisionQuery(
    { courseId, revisionId },
    { skip: !courseId || !revisionId },
  );
  const sectionsQuery = useListRevisionSectionsQuery(
    { courseId, revisionId },
    { skip: !courseId || !revisionId },
  );
  const categoriesQuery = useListPublicCategoriesQuery({ page: 1, limit: 100 });

  const [updateMetadata, { isLoading: isUpdating }] =
    useUpdateRevisionMetadataMutation();
  const [submitRevision, { isLoading: isSubmitting }] =
    useSubmitPublishedCourseRevisionMutation();
  const [reopenRevision, { isLoading: isReopening }] =
    useReopenPublishedCourseRevisionMutation();
  const [discardRevision, { isLoading: isDiscarding }] =
    useDiscardPublishedCourseRevisionMutation();

  const rev = revisionQuery.data?.data;
  const meta = (rev?.metadata ?? {}) as Record<string, unknown>;

  const [title, setTitle] = useState<string | null>(null);
  const [shortDescription, setShortDescription] = useState<string | null>(null);
  const [description, setDescription] = useState<string | null>(null);
  const [priceEgp, setPriceEgp] = useState<number | null>(null);
  const [level, setLevel] = useState<CourseLevel | null>(null);
  const [language, setLanguage] = useState<CourseLanguage | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  if (revisionQuery.isLoading || categoriesQuery.isLoading) {
    return <DashboardSkeleton rows={6} />;
  }

  if (revisionQuery.isError || !rev) {
    return (
      <DashboardErrorState
        message={parseApiError(revisionQuery.error, 'Revision not found.').message}
        onRetry={() => revisionQuery.refetch()}
      />
    );
  }

  const resolvedTitle = title ?? (typeof meta.title === 'string' ? meta.title : '');
  const resolvedShort =
    shortDescription ??
    (typeof meta.shortDescription === 'string' ? meta.shortDescription : '');
  const resolvedDesc =
    description ?? (typeof meta.description === 'string' ? meta.description : '');
  const resolvedPriceEgp =
    priceEgp ??
    (typeof meta.priceMinor === 'number' ? Math.floor(meta.priceMinor / 100) : 0);
  const resolvedLevel =
    level ?? ((meta.level as CourseLevel | null) ?? null);
  const resolvedLang =
    language ?? ((meta.language as CourseLanguage | null) ?? null);
  const resolvedCatId =
    categoryId ?? (typeof meta.categoryId === 'string' ? meta.categoryId : '');

  const isEditable = rev.status === 'draft';
  const categories = categoriesQuery.data?.data?.categories ?? [];
  const sections = sectionsQuery.data?.data?.items ?? [];

  const handleSaveMetadata = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    try {
      await updateMetadata({
        courseId,
        revisionId,
        expectedRevision: rev.revision,
        patch: {
          title: resolvedTitle.trim(),
          shortDescription: resolvedShort.trim(),
          description: resolvedDesc.trim(),
          priceMinor: Math.max(0, Math.trunc(resolvedPriceEgp)) * 100,
          level: resolvedLevel,
          language: resolvedLang,
          categoryId: resolvedCatId,
        },
      }).unwrap();
      void message.success('Revision draft saved. Live course remains unchanged until approved.');
    } catch (err) {
      setFormError(parseApiError(err).message);
    }
  };

  const handleSubmitForReview = async () => {
    setFormError(null);
    try {
      await submitRevision({
        courseId,
        revisionId,
        expectedRevision: rev.revision,
      }).unwrap();
      void message.success('Revision submitted for admin review.');
    } catch (err) {
      setFormError(parseApiError(err).message);
    }
  };

  const handleReopen = async () => {
    setFormError(null);
    try {
      await reopenRevision({
        courseId,
        revisionId,
        expectedRevision: rev.revision,
      }).unwrap();
      void message.success('Revision reopened for editing.');
    } catch (err) {
      setFormError(parseApiError(err).message);
    }
  };

  const handleDiscard = async () => {
    setFormError(null);
    try {
      await discardRevision({
        courseId,
        revisionId,
        expectedRevision: rev.revision,
      }).unwrap();
      void message.success('Revision discarded.');
      navigate(`/instructor/courses/${courseId}/edit`);
    } catch (err) {
      setFormError(parseApiError(err).message);
    }
  };

  return (
    <div className="space-y-lg max-w-[900px]">
      <Link
        to={`/instructor/courses/${courseId}/edit`}
        className="inline-flex items-center gap-xs text-[13px] font-semibold text-primary hover:text-primary-light"
      >
        <ArrowLeftOutlined />
        <span>Back to Course</span>
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-md">
        <div>
          <div className="flex items-center gap-xs flex-wrap">
            <StatusBadge label={`Revision #${rev.number}`} tone="teal" />
            <StatusBadge label={rev.status.replace('_', ' ')} />
          </div>
          <h1 className="text-[24px] font-bold text-ink mt-xs mb-0">
            Edit Published Course (Isolated Revision)
          </h1>
          <p className="text-[13px] text-ink-secondary mt-xxs mb-0">
            Your live published course stays available to enrolled students while this revision is edited and reviewed.
          </p>
        </div>

        <Space wrap>
          {rev.status === 'draft' && (
            <>
              <DashboardButton
                variant="primary"
                icon={<SendOutlined />}
                loading={isSubmitting}
                onClick={handleSubmitForReview}
              >
                Submit Revision for Review
              </DashboardButton>
              <DashboardButton
                variant="secondary"
                loading={isDiscarding}
                onClick={handleDiscard}
              >
                Discard Revision
              </DashboardButton>
            </>
          )}
          {rev.status === 'rejected' && (
            <DashboardButton
              variant="primary"
              loading={isReopening}
              onClick={handleReopen}
            >
              Reopen Revision
            </DashboardButton>
          )}
        </Space>
      </div>

      {rev.status === 'rejected' && rev.rejectionReason && (
        <Alert
          type="error"
          showIcon
          title="Revision Rejected"
          description={rev.rejectionReason}
        />
      )}

      {formError && <Alert type="error" showIcon title={formError} />}

      <Card className="rounded-xxl shadow-card border-hairline" styles={{ body: { padding: 24 } }}>
        <form onSubmit={handleSaveMetadata} className="space-y-md">
          <DashboardInput
            label="Title"
            value={resolvedTitle}
            disabled={!isEditable}
            onChange={(e) => setTitle(e.target.value)}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
            <div className="space-y-xxs">
              <label className="block text-[14px] font-semibold text-ink">
                Category
              </label>
              <Select
                className="w-full"
                value={resolvedCatId || undefined}
                disabled={!isEditable}
                onChange={(val) => setCategoryId(val)}
                options={categories.map((c) => ({ label: c.name, value: c.id }))}
              />
            </div>

            <div className="space-y-xxs">
              <label className="block text-[14px] font-semibold text-ink">
                Price (EGP)
              </label>
              <InputNumber
                className="w-full"
                min={0}
                precision={0}
                value={resolvedPriceEgp}
                disabled={!isEditable}
                onChange={(val) => setPriceEgp(typeof val === 'number' ? val : 0)}
                addonAfter="EGP"
              />
              <p className="text-[12px] text-ink-muted m-0">
                Preview: {formatEgpPrice(Math.max(0, Math.trunc(resolvedPriceEgp)) * 100)}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
            <div className="space-y-xxs">
              <label className="block text-[14px] font-semibold text-ink">Level</label>
              <Select
                className="w-full"
                allowClear
                value={resolvedLevel ?? undefined}
                disabled={!isEditable}
                onChange={(val) => setLevel(val ?? null)}
                options={[
                  { label: 'Beginner', value: 'beginner' },
                  { label: 'Intermediate', value: 'intermediate' },
                  { label: 'Advanced', value: 'advanced' },
                  { label: 'All Levels', value: 'all_levels' },
                ]}
              />
            </div>
            <div className="space-y-xxs">
              <label className="block text-[14px] font-semibold text-ink">Language</label>
              <Select
                className="w-full"
                allowClear
                value={resolvedLang ?? undefined}
                disabled={!isEditable}
                onChange={(val) => setLanguage(val ?? null)}
                options={[
                  { label: 'Arabic (ar)', value: 'ar' },
                  { label: 'English (en)', value: 'en' },
                ]}
              />
            </div>
          </div>

          <DashboardInput
            label="Short Description"
            value={resolvedShort}
            disabled={!isEditable}
            onChange={(e) => setShortDescription(e.target.value)}
          />

          <div className="space-y-xxs">
            <label className="block text-[14px] font-semibold text-ink">
              Full Description
            </label>
            <Input.TextArea
              rows={5}
              value={resolvedDesc}
              disabled={!isEditable}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {isEditable && (
            <DashboardButton
              htmlType="submit"
              variant="primary-lg"
              loading={isUpdating}
            >
              Save Revision Changes
            </DashboardButton>
          )}
        </form>
      </Card>

      <Card className="rounded-lg shadow-card border-hairline">
        <h2 className="text-[16px] font-semibold text-ink mb-xs">
          Revision Curriculum Snapshot ({sections.length} sections)
        </h2>
        <ul className="space-y-xxs pl-0 list-none m-0 text-[13px] text-ink-secondary">
          {sections.map((sec, idx) => (
            <li key={sec.id}>
              {idx + 1}. {sec.title}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
