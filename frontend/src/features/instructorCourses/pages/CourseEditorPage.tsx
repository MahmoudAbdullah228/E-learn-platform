import {
  ArrowLeftOutlined,
  DeleteOutlined,
  PlusOutlined,
  SendOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { Alert, Card, Input, InputNumber, Select, Space, Upload } from 'antd';
import type { RcFile } from 'antd/es/upload';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  DashboardButton,
  DashboardErrorState,
  DashboardInput,
  DashboardSkeleton,
  StatusBadge,
  UploadProgressCard,
  useDashboardNotify,
} from '@/components/dashboard';
import { useListPublicCategoriesQuery } from '@/features/catalog/catalogApi';
import {
  useCreatePublishedCourseRevisionMutation,
} from '@/features/instructorCourses/courseRevisionsApi';
import {
  useCreateInstructorCourseMutation,
  useGetInstructorCourseQuery,
  useReopenCourseMutation,
  useSubmitCourseForReviewMutation,
  useUpdateInstructorCourseMutation,
  type CourseLanguage,
  type CourseLevel,
  type InstructorCourseDto,
} from '@/features/instructorCourses/instructorCoursesApi';
import {
  uploadDirectToCloudinary,
  useConfirmMediaUploadMutation,
  useCreateUploadIntentMutation,
  useDeleteMediaAssetMutation,
} from '@/features/media/mediaApi';
import { parseApiError } from '@/lib/apiError';
import { formatEgpPrice } from '@/lib/formatters';
import { courseDraftSchema } from '@/lib/validation';

interface CourseEditorFormProps {
  course: InstructorCourseDto | null;
  categories: { id: string; name: string }[];
  onCreated: (courseId: string) => void;
  onRefreshCourse: () => void;
}

function CourseEditorForm({
  course,
  categories,
  onCreated,
  onRefreshCourse,
}: CourseEditorFormProps) {
  const { message } = useDashboardNotify();

  const [createCourse, { isLoading: isCreating }] = useCreateInstructorCourseMutation();
  const [updateCourse, { isLoading: isUpdating }] = useUpdateInstructorCourseMutation();
  const [submitReview, { isLoading: isSubmittingReview }] =
    useSubmitCourseForReviewMutation();
  const [reopenCourse, { isLoading: isReopening }] = useReopenCourseMutation();
  const [createMediaIntent] = useCreateUploadIntentMutation();
  const [confirmUpload] = useConfirmMediaUploadMutation();
  const [deleteMedia, { isLoading: isRemovingCover }] = useDeleteMediaAssetMutation();
  const [createRevision, { isLoading: isStartingRevision }] =
    useCreatePublishedCourseRevisionMutation();
  const navigate = useNavigate();

  const isCreateMode = course === null;
  const isEditable = isCreateMode || course.status === 'draft';

  const [title, setTitle] = useState(course?.title ?? '');
  const [categoryId, setCategoryId] = useState(course?.categoryId ?? '');
  const [shortDescription, setShortDescription] = useState(
    course?.shortDescription ?? '',
  );
  const [description, setDescription] = useState(course?.description ?? '');
  const [level, setLevel] = useState<CourseLevel | null>(course?.level ?? null);
  const [language, setLanguage] = useState<CourseLanguage | null>(
    course?.language ?? null,
  );
  const [priceEgp, setPriceEgp] = useState<number>(
    course ? Math.floor(course.priceMinor / 100) : 0,
  );
  const [requirements, setRequirements] = useState<string[]>(
    course?.requirements ?? [],
  );
  const [learningOutcomes, setLearningOutcomes] = useState<string[]>(
    course?.learningOutcomes ?? [],
  );
  const [newRequirement, setNewRequirement] = useState('');
  const [newOutcome, setNewOutcome] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [coverUploadState, setCoverUploadState] = useState<{
    fileName: string;
    percent: number;
    statusLabel: string;
    isError?: boolean;
    isComplete?: boolean;
  } | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isEditable) return;

    setFormError(null);
    setFieldErrors({});

    const priceMinor = Math.max(0, Math.trunc(priceEgp)) * 100;

    const parsed = courseDraftSchema.safeParse({
      title,
      categoryId,
      shortDescription,
      description,
      level,
      language,
      priceMinor,
      requirements,
      learningOutcomes,
    });

    if (!parsed.success) {
      const nextErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'form');
        if (!nextErrors[key]) nextErrors[key] = issue.message;
      }
      setFieldErrors(nextErrors);
      setFormError(parsed.error.issues[0]?.message ?? 'Please check the form fields.');
      return;
    }

    try {
      if (isCreateMode) {
        const res = await createCourse(parsed.data).unwrap();
        void message.success('Draft course created!');
        onCreated(res.data.course.id);
      } else {
        await updateCourse({
          courseId: course.id,
          patch: parsed.data,
        }).unwrap();
        void message.success('Draft saved.');
      }
    } catch (err) {
      const apiErr = parseApiError(err);
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

  const handleCoverUpload = async (file: RcFile) => {
    if (!course || !isEditable) return false;
    try {
      setCoverUploadState({
        fileName: file.name,
        percent: 5,
        statusLabel: 'Preparing upload…',
      });
      const intentRes = await createMediaIntent({
        purpose: 'course_cover',
        targetId: course.id,
      }).unwrap();

      if (file.size > intentRes.data.maxBytes) {
        setCoverUploadState(null);
        void message.error(
          `Cover image exceeds ${Math.round(intentRes.data.maxBytes / (1024 * 1024))} MB.`,
        );
        return false;
      }

      await uploadDirectToCloudinary(intentRes.data.upload, file, (percent) => {
        setCoverUploadState({
          fileName: file.name,
          percent,
          statusLabel: percent >= 100 ? 'Confirming…' : `Uploading ${percent}%`,
        });
      });

      await confirmUpload(intentRes.data.assetId).unwrap();
      onRefreshCourse();
      setCoverUploadState({
        fileName: file.name,
        percent: 100,
        statusLabel: 'Confirmed',
        isComplete: true,
      });
      void message.success('Course cover uploaded and confirmed.');
    } catch (err) {
      const parsed = parseApiError(err, 'Cover upload failed.');
      setCoverUploadState({
        fileName: file.name,
        percent: 0,
        statusLabel: 'Failed',
        isError: true,
      });
      void message.error(parsed.message);
    }
    return false;
  };

  const handleRemoveCover = async () => {
    if (!course?.coverAssetId || !isEditable) return;
    try {
      await deleteMedia(course.coverAssetId).unwrap();
      onRefreshCourse();
      setCoverUploadState(null);
      void message.success('Cover image removed.');
    } catch (err) {
      void message.error(parseApiError(err).message);
    }
  };

  const handleSubmitForReview = async () => {
    if (!course) return;
    setFormError(null);
    try {
      await submitReview(course.id).unwrap();
      void message.success('Course submitted for admin review!');
    } catch (err) {
      const parsed = parseApiError(err);
      const hint = parsed.details[0]?.message;
      const fullMsg = hint ? `${parsed.message}: ${hint}` : parsed.message;
      setFormError(fullMsg);
      void message.error(fullMsg);
    }
  };

  const handleReopen = async () => {
    if (!course) return;
    try {
      await reopenCourse(course.id).unwrap();
      void message.success('Course reopened as a draft.');
    } catch (err) {
      void message.error(parseApiError(err).message);
    }
  };

  return (
    <div className="space-y-lg max-w-[900px]">
      <div className="flex flex-wrap items-center justify-between gap-md">
        <div>
          <Link
            to="/instructor/courses"
            className="inline-flex items-center gap-xs text-[13px] font-semibold text-primary hover:text-primary-light"
          >
            <ArrowLeftOutlined />
            <span>Back to Courses</span>
          </Link>
          <div className="flex items-center gap-sm mt-xxs flex-wrap">
            <h1 className="text-[24px] font-bold text-ink m-0">
              {isCreateMode ? 'Create Draft Course' : course.title}
            </h1>
            {course && <StatusBadge label={course.status.replace('_', ' ')} />}
          </div>
        </div>

        {course && (
          <Space wrap>
            <Link to={`/instructor/courses/${course.id}/curriculum`}>
              <DashboardButton variant="outline">Curriculum Editor</DashboardButton>
            </Link>
            {course.status === 'draft' && (
              <DashboardButton
                variant="primary"
                icon={<SendOutlined />}
                loading={isSubmittingReview}
                onClick={handleSubmitForReview}
              >
                Submit for Review
              </DashboardButton>
            )}
            {(course.status === 'rejected' || course.status === 'unavailable') && (
              <DashboardButton
                variant="primary"
                loading={isReopening}
                onClick={handleReopen}
              >
                Reopen as Draft
              </DashboardButton>
            )}
            {course.status === 'published' && (
              <DashboardButton
                variant="primary"
                loading={isStartingRevision}
                onClick={async () => {
                  try {
                    const res = await createRevision(course.id).unwrap();
                    navigate(
                      `/instructor/courses/${course.id}/revisions/${res.data.id}`,
                    );
                  } catch (err) {
                    void message.error(parseApiError(err).message);
                  }
                }}
              >
                Create Published Revision
              </DashboardButton>
            )}
          </Space>
        )}
      </div>

      {course?.status === 'rejected' && (
        <Alert
          type="error"
          showIcon
          title="Course Rejected"
          description={
            course.rejectionReason ??
            'No rejection reason provided. Reopen as draft to make changes and resubmit.'
          }
        />
      )}

      {course?.status === 'unavailable' && (
        <Alert
          type="warning"
          showIcon
          title="Course Marked Unavailable"
          description="A video asset in this published course became unavailable on Mux. Reopen the course as a draft, replace or repair the affected lesson video, and resubmit."
        />
      )}

      {course && course.status !== 'draft' && (
        <Alert
          type="info"
          showIcon
          title="Read-Only Course State"
          description={
            course.status === 'published'
              ? 'Published courses cannot be edited via the draft endpoint. Use the Course Revisions workflow (Phase 8) to edit a published course.'
              : `This course is currently ${course.status.replace('_', ' ')} and cannot be edited right now.`
          }
        />
      )}

      {course && course.category === null && (
        <Alert
          type="warning"
          showIcon
          title="Original Category Deleted"
          description="Please select an active category before submitting this course for review."
        />
      )}

      {formError && (
        <Alert type="error" showIcon title={formError} />
      )}

      {/* Cover Image Upload (Draft existing courses only) */}
      {course && (
        <Card className="rounded-xxl shadow-card border-hairline" styles={{ body: { padding: 24 } }}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-md">
            <div>
              <h2 className="text-[18px] font-semibold text-ink m-0">Course Cover</h2>
              <p className="text-[13px] text-ink-muted m-0">
                Required before submitting for review. Current status:{' '}
                {course.coverAssetId ? 'Cover confirmed' : 'No cover uploaded'}
              </p>
            </div>
            {isEditable && (
              <Space wrap>
                <Upload
                  accept="image/jpeg,image/png,image/webp"
                  showUploadList={false}
                  beforeUpload={handleCoverUpload}
                >
                  <DashboardButton variant="outline" icon={<UploadOutlined />}>
                    {course.coverAssetId ? 'Replace Cover' : 'Upload Cover'}
                  </DashboardButton>
                </Upload>
                {course.coverAssetId && (
                  <DashboardButton
                    variant="secondary"
                    icon={<DeleteOutlined />}
                    loading={isRemovingCover}
                    onClick={handleRemoveCover}
                  >
                    Remove
                  </DashboardButton>
                )}
              </Space>
            )}
          </div>
          {coverUploadState && (
            <div className="mt-md">
              <UploadProgressCard
                fileName={coverUploadState.fileName}
                percent={coverUploadState.percent}
                statusLabel={coverUploadState.statusLabel}
                isError={coverUploadState.isError}
                isComplete={coverUploadState.isComplete}
              />
            </div>
          )}
        </Card>
      )}

      {/* Course Details Form */}
      <Card className="rounded-xxl shadow-card border-hairline" styles={{ body: { padding: 24 } }}>
        <form onSubmit={handleSave} className="space-y-lg">
          <DashboardInput
            label="Course Title"
            placeholder="e.g. Modern React & TypeScript Masterclass"
            value={title}
            disabled={!isEditable}
            onChange={(e) => setTitle(e.target.value)}
            error={fieldErrors.title}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
            <div className="space-y-xxs">
              <label className="block text-[14px] font-semibold text-ink">
                Category (Active Only)
              </label>
              <Select
                className="w-full"
                placeholder="Select a category"
                value={categoryId || undefined}
                disabled={!isEditable}
                status={fieldErrors.categoryId ? 'error' : undefined}
                onChange={(val) => setCategoryId(val)}
                options={categories.map((c) => ({ label: c.name, value: c.id }))}
              />
              {fieldErrors.categoryId && (
                <p className="text-[12px] text-error m-0">{fieldErrors.categoryId}</p>
              )}
            </div>

            <div className="space-y-xxs">
              <label className="block text-[14px] font-semibold text-ink">
                Price (EGP)
              </label>
              <InputNumber
                className="w-full"
                min={0}
                precision={0}
                value={priceEgp}
                disabled={!isEditable}
                onChange={(val) => setPriceEgp(typeof val === 'number' ? val : 0)}
                addonAfter="EGP"
              />
              <p className="text-[12px] text-ink-muted m-0">
                Displayed as: {formatEgpPrice(Math.max(0, Math.trunc(priceEgp)) * 100)}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
            <div className="space-y-xxs">
              <label className="block text-[14px] font-semibold text-ink">Level</label>
              <Select
                className="w-full"
                allowClear
                placeholder="Select level"
                value={level ?? undefined}
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
                placeholder="Select language"
                value={language ?? undefined}
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
            placeholder="A clear one-sentence summary (10–300 chars required for review)"
            value={shortDescription}
            disabled={!isEditable}
            onChange={(e) => setShortDescription(e.target.value)}
            error={fieldErrors.shortDescription}
          />

          <div className="space-y-xxs">
            <label className="block text-[14px] font-semibold text-ink">
              Full Description
            </label>
            <Input.TextArea
              rows={5}
              value={description}
              disabled={!isEditable}
              onChange={(e) => setDescription(e.target.value)}
              status={fieldErrors.description ? 'error' : undefined}
            />
            {fieldErrors.description && (
              <p className="text-[12px] text-error m-0">{fieldErrors.description}</p>
            )}
          </div>

          {/* Learning Outcomes */}
          <div className="space-y-xs">
            <label className="block text-[14px] font-semibold text-ink">
              Learning Outcomes ({learningOutcomes.length}/30)
            </label>
            {isEditable && (
              <div className="flex gap-xs">
                <Input
                  placeholder="Add an outcome (2–300 chars)..."
                  value={newOutcome}
                  onChange={(e) => setNewOutcome(e.target.value)}
                />
                <DashboardButton
                  variant="outline"
                  icon={<PlusOutlined />}
                  disabled={learningOutcomes.length >= 30 || newOutcome.trim().length < 2}
                  onClick={() => {
                    const trimmed = newOutcome.trim();
                    if (
                      trimmed &&
                      !learningOutcomes.some(
                        (x) => x.toLowerCase() === trimmed.toLowerCase(),
                      )
                    ) {
                      setLearningOutcomes((prev) => [...prev, trimmed]);
                      setNewOutcome('');
                    }
                  }}
                >
                  Add
                </DashboardButton>
              </div>
            )}
            <ul className="space-y-xxs pl-0 list-none m-0">
              {learningOutcomes.map((item, idx) => (
                <li
                  key={item}
                  className="flex items-center justify-between gap-sm bg-surface-subtle px-sm py-xs rounded-md border border-border text-[13px]"
                >
                  <span>{item}</span>
                  {isEditable && (
                    <DashboardButton
                      variant="link-action"
                      onClick={() =>
                        setLearningOutcomes((prev) => prev.filter((_, i) => i !== idx))
                      }
                    >
                      Remove
                    </DashboardButton>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {/* Prerequisites */}
          <div className="space-y-xs">
            <label className="block text-[14px] font-semibold text-ink">
              Prerequisites ({requirements.length}/30)
            </label>
            {isEditable && (
              <div className="flex gap-xs">
                <Input
                  placeholder="Add a prerequisite (2–300 chars)..."
                  value={newRequirement}
                  onChange={(e) => setNewRequirement(e.target.value)}
                />
                <DashboardButton
                  variant="outline"
                  icon={<PlusOutlined />}
                  disabled={requirements.length >= 30 || newRequirement.trim().length < 2}
                  onClick={() => {
                    const trimmed = newRequirement.trim();
                    if (
                      trimmed &&
                      !requirements.some(
                        (x) => x.toLowerCase() === trimmed.toLowerCase(),
                      )
                    ) {
                      setRequirements((prev) => [...prev, trimmed]);
                      setNewRequirement('');
                    }
                  }}
                >
                  Add
                </DashboardButton>
              </div>
            )}
            <ul className="space-y-xxs pl-0 list-none m-0">
              {requirements.map((item, idx) => (
                <li
                  key={item}
                  className="flex items-center justify-between gap-sm bg-surface-subtle px-sm py-xs rounded-md border border-border text-[13px]"
                >
                  <span>{item}</span>
                  {isEditable && (
                    <DashboardButton
                      variant="link-action"
                      onClick={() =>
                        setRequirements((prev) => prev.filter((_, i) => i !== idx))
                      }
                    >
                      Remove
                    </DashboardButton>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {isEditable && (
            <div className="pt-xs">
              <DashboardButton
                htmlType="submit"
                variant="primary-lg"
                loading={isCreating || isUpdating}
              >
                {isCreateMode ? 'Create Draft Course' : 'Save Draft Changes'}
              </DashboardButton>
            </div>
          )}
        </form>
      </Card>
    </div>
  );
}

export default function CourseEditorPage() {
  const { courseId } = useParams();
  const navigate = useNavigate();

  const { data: categoriesRes, isLoading: isCategoriesLoading } =
    useListPublicCategoriesQuery({ page: 1, limit: 100 });
  const {
    data: courseRes,
    isLoading: isCourseLoading,
    isError,
    error,
    refetch,
  } = useGetInstructorCourseQuery(courseId ?? '', {
    skip: !courseId,
  });

  if (isCategoriesLoading || (courseId && isCourseLoading)) {
    return <DashboardSkeleton rows={7} />;
  }

  if (courseId && (isError || !courseRes?.data?.course)) {
    return (
      <DashboardErrorState
        message={parseApiError(error, 'Course was not found.').message}
        onRetry={() => refetch()}
      />
    );
  }

  const course = courseId ? courseRes?.data?.course ?? null : null;
  const categories = categoriesRes?.data?.categories ?? [];

  return (
    <CourseEditorForm
      key={course ? `${course.id}-${course.updatedAt}` : 'new'}
      course={course}
      categories={categories}
      onCreated={(newId) => navigate(`/instructor/courses/${newId}/edit`, { replace: true })}
      onRefreshCourse={() => void refetch()}
    />
  );
}
