import {
  ArrowDownOutlined,
  ArrowLeftOutlined,
  ArrowUpOutlined,
  DeleteOutlined,
  EditOutlined,
  FilePdfOutlined,
  PlusOutlined,
  ReloadOutlined,
  VideoCameraAddOutlined,
} from '@ant-design/icons';
import { Alert, Card, Input, Space, Switch, Upload } from 'antd';
import type { RcFile } from 'antd/es/upload';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  DashboardButton,
  DashboardEmptyState,
  DashboardErrorState,
  DashboardInput,
  DashboardModal,
  DashboardSkeleton,
  StatusBadge,
  UploadProgressCard,
  useDashboardNotify,
} from '@/components/dashboard';
import { useGetInstructorCourseQuery } from '@/features/instructorCourses/instructorCoursesApi';
import {
  uploadVideoDirectToMux,
  useCreateLessonMutation,
  useCreateSectionMutation,
  useDeleteLessonMutation,
  useDeleteSectionMutation,
  useGetInstructorCurriculumQuery,
  useReorderLessonsMutation,
  useReorderSectionsMutation,
  useRequestLessonVideoUploadMutation,
  useUpdateLessonMutation,
  useUpdateSectionMutation,
  type InstructorLessonDto,
} from '@/features/instructorCurriculum/instructorCurriculumApi';
import {
  uploadDirectToCloudinary,
  useConfirmMediaUploadMutation,
  useCreateUploadIntentMutation,
  useDeleteMediaAssetMutation,
} from '@/features/media/mediaApi';
import { parseApiError } from '@/lib/apiError';
import { formatDuration } from '@/lib/formatters';

export default function CurriculumEditorPage() {
  const { courseId = '' } = useParams();
  const { message } = useDashboardNotify();

  const {
    data: courseRes,
    isLoading: isCourseLoading,
    isError: isCourseError,
    error: courseError,
  } = useGetInstructorCourseQuery(courseId, { skip: !courseId });

  const {
    data: curriculumRes,
    isLoading: isCurriculumLoading,
    isError: isCurriculumError,
    error: curriculumError,
    refetch: refetchCurriculum,
  } = useGetInstructorCurriculumQuery(courseId, { skip: !courseId });

  const [createSection, { isLoading: isCreatingSection }] =
    useCreateSectionMutation();
  const [updateSection] = useUpdateSectionMutation();
  const [deleteSection] = useDeleteSectionMutation();
  const [reorderSections] = useReorderSectionsMutation();

  const [createLesson, { isLoading: isCreatingLesson }] =
    useCreateLessonMutation();
  const [updateLesson] = useUpdateLessonMutation();
  const [deleteLesson] = useDeleteLessonMutation();
  const [reorderLessons] = useReorderLessonsMutation();
  const [requestVideoUpload] = useRequestLessonVideoUploadMutation();

  const [createMediaIntent] = useCreateUploadIntentMutation();
  const [confirmMedia] = useConfirmMediaUploadMutation();
  const [deleteMedia] = useDeleteMediaAssetMutation();

  const [newSectionTitle, setNewSectionTitle] = useState('');
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [editingSectionTitle, setEditingSectionTitle] = useState('');

  const [lessonModalSectionId, setLessonModalSectionId] = useState<string | null>(
    null,
  );
  const [editingLesson, setEditingLesson] = useState<InstructorLessonDto | null>(
    null,
  );
  const [lessonTitle, setLessonTitle] = useState('');
  const [lessonDescription, setLessonDescription] = useState('');
  const [lessonPreview, setLessonPreview] = useState(false);

  const [uploadProgressMap, setUploadProgressMap] = useState<
    Record<
      string,
      {
        fileName: string;
        percent: number;
        statusLabel: string;
        isError?: boolean;
        isComplete?: boolean;
      }
    >
  >({});

  const course = courseRes?.data?.course;
  const sections = curriculumRes?.data?.sections ?? [];
  const isDraft = course?.status === 'draft';

  const hasProcessingVideo = sections.some((sec) =>
    sec.lessons.some(
      (l) => l.videoStatus === 'pending' || l.videoStatus === 'processing',
    ),
  );

  // Poll curriculum every 5s while any lesson video is pending/processing via Mux webhook.
  useEffect(() => {
    if (!hasProcessingVideo) return;
    const id = window.setInterval(() => {
      void refetchCurriculum();
    }, 5_000);
    return () => window.clearInterval(id);
  }, [hasProcessingVideo, refetchCurriculum]);

  if (isCourseLoading || isCurriculumLoading) {
    return <DashboardSkeleton rows={7} />;
  }

  if (isCourseError || isCurriculumError || !course) {
    return (
      <DashboardErrorState
        message={
          parseApiError(courseError ?? curriculumError, 'Unable to load curriculum.')
            .message
        }
        onRetry={() => refetchCurriculum()}
      />
    );
  }

  const handleAddSection = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = newSectionTitle.trim();
    if (title.length < 3) {
      void message.error('Section title must be at least 3 characters.');
      return;
    }
    try {
      await createSection({ courseId: course.id, title }).unwrap();
      setNewSectionTitle('');
      void message.success('Section added.');
    } catch (err) {
      void message.error(parseApiError(err).message);
    }
  };

  const handleSaveSectionEdit = async (sectionId: string) => {
    const title = editingSectionTitle.trim();
    if (title.length < 3) {
      void message.error('Section title must be at least 3 characters.');
      return;
    }
    try {
      await updateSection({ courseId: course.id, sectionId, title }).unwrap();
      setEditingSectionId(null);
      void message.success('Section updated.');
    } catch (err) {
      void message.error(parseApiError(err).message);
    }
  };

  const handleMoveSection = async (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= sections.length) return;
    const ids = sections.map((s) => s.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(targetIndex, 0, moved);
    try {
      await reorderSections({ courseId: course.id, orderedIds: ids }).unwrap();
    } catch (err) {
      const parsed = parseApiError(err);
      if (parsed.code === 'INVALID_CURRICULUM_ORDER') {
        void refetchCurriculum();
      }
      void message.error(parsed.message);
    }
  };

  const handleMoveLesson = async (
    sectionId: string,
    lessons: InstructorLessonDto[],
    index: number,
    direction: -1 | 1,
  ) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= lessons.length) return;
    const ids = lessons.map((l) => l.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(targetIndex, 0, moved);
    try {
      await reorderLessons({
        courseId: course.id,
        sectionId,
        orderedIds: ids,
      }).unwrap();
    } catch (err) {
      const parsed = parseApiError(err);
      if (parsed.code === 'INVALID_CURRICULUM_ORDER') {
        void refetchCurriculum();
      }
      void message.error(parsed.message);
    }
  };

  const openCreateLessonModal = (sectionId: string) => {
    setEditingLesson(null);
    setLessonModalSectionId(sectionId);
    setLessonTitle('');
    setLessonDescription('');
    setLessonPreview(false);
  };

  const openEditLessonModal = (lesson: InstructorLessonDto) => {
    setLessonModalSectionId(null);
    setEditingLesson(lesson);
    setLessonTitle(lesson.title);
    setLessonDescription(lesson.description);
    setLessonPreview(lesson.isPreview);
  };

  const handleSaveLessonModal = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = lessonTitle.trim();
    if (title.length < 3) {
      void message.error('Lesson title must be at least 3 characters.');
      return;
    }
    if (lessonDescription.length > 10000) {
      void message.error('Lesson description must not exceed 10000 characters.');
      return;
    }

    try {
      if (editingLesson) {
        await updateLesson({
          courseId: course.id,
          lessonId: editingLesson.id,
          patch: {
            title,
            description: lessonDescription,
            isPreview: lessonPreview,
          },
        }).unwrap();
        setEditingLesson(null);
        void message.success('Lesson updated.');
      } else if (lessonModalSectionId) {
        await createLesson({
          courseId: course.id,
          sectionId: lessonModalSectionId,
          title,
          description: lessonDescription,
          isPreview: lessonPreview,
        }).unwrap();
        setLessonModalSectionId(null);
        void message.success('Lesson added.');
      }
    } catch (err) {
      void message.error(parseApiError(err).message);
    }
  };

  const handleVideoUpload = async (lessonId: string, file: RcFile) => {
    try {
      setUploadProgressMap((prev) => ({
        ...prev,
        [lessonId]: {
          fileName: file.name,
          percent: 5,
          statusLabel: 'Requesting Mux upload…',
        },
      }));
      const res = await requestVideoUpload({
        courseId: course.id,
        lessonId,
      }).unwrap();

      // Upload directly to Mux upload URL; never persist or log the temporary URL.
      await uploadVideoDirectToMux(res.data.upload.url, file, (percent) => {
        setUploadProgressMap((prev) => ({
          ...prev,
          [lessonId]: {
            fileName: file.name,
            percent,
            statusLabel: percent >= 100 ? 'Processing video…' : `Uploading ${percent}%`,
            isComplete: percent >= 100,
          },
        }));
      });
      void refetchCurriculum();
      void message.success('Video uploaded. Processing will finish shortly.');
    } catch (err) {
      const parsed = parseApiError(err, 'Video upload failed.');
      setUploadProgressMap((prev) => ({
        ...prev,
        [lessonId]: {
          fileName: file.name,
          percent: 0,
          statusLabel: 'Upload Failed',
          isError: true,
        },
      }));
      void message.error(parsed.message);
    }
    return false;
  };

  const handleAttachmentUpload = async (lessonId: string, file: RcFile) => {
    try {
      setUploadProgressMap((prev) => ({
        ...prev,
        [`pdf-${lessonId}`]: {
          fileName: file.name,
          percent: 5,
          statusLabel: 'Preparing PDF upload…',
        },
      }));
      const intentRes = await createMediaIntent({
        purpose: 'lesson_attachment',
        targetId: lessonId,
      }).unwrap();

      if (file.size > intentRes.data.maxBytes) {
        setUploadProgressMap((prev) => {
          const next = { ...prev };
          delete next[`pdf-${lessonId}`];
          return next;
        });
        void message.error(
          `PDF exceeds maximum size of ${Math.round(intentRes.data.maxBytes / (1024 * 1024))} MB.`,
        );
        return false;
      }

      await uploadDirectToCloudinary(intentRes.data.upload, file, (percent) => {
        setUploadProgressMap((prev) => ({
          ...prev,
          [`pdf-${lessonId}`]: {
            fileName: file.name,
            percent,
            statusLabel: percent >= 100 ? 'Confirming…' : `Uploading ${percent}%`,
          },
        }));
      });

      await confirmMedia(intentRes.data.assetId).unwrap();
      void refetchCurriculum();
      setUploadProgressMap((prev) => ({
        ...prev,
        [`pdf-${lessonId}`]: {
          fileName: file.name,
          percent: 100,
          statusLabel: 'PDF Attached',
          isComplete: true,
        },
      }));
      void message.success('PDF attachment confirmed.');
    } catch (err) {
      const parsed = parseApiError(err, 'PDF upload failed.');
      setUploadProgressMap((prev) => ({
        ...prev,
        [`pdf-${lessonId}`]: {
          fileName: file.name,
          percent: 0,
          statusLabel: 'Failed',
          isError: true,
        },
      }));
      void message.error(parsed.message);
    }
    return false;
  };

  return (
    <div className="space-y-lg max-w-[980px]">
      <div className="flex flex-wrap items-center justify-between gap-md">
        <div>
          <Link
            to={`/instructor/courses/${course.id}/edit`}
            className="inline-flex items-center gap-xs text-[13px] font-semibold text-primary hover:text-primary-light"
          >
            <ArrowLeftOutlined />
            <span>Back to Course Details</span>
          </Link>
          <div className="flex items-center gap-sm mt-xxs flex-wrap">
            <h1 className="text-[24px] font-bold text-ink m-0">
              Curriculum: {course.title}
            </h1>
            <StatusBadge label={course.status.replace('_', ' ')} />
          </div>
        </div>

        <DashboardButton
          variant="secondary"
          icon={<ReloadOutlined />}
          onClick={() => void refetchCurriculum()}
        >
          Refresh Status
        </DashboardButton>
      </div>

      {!isDraft && (
        <Alert
          type="info"
          showIcon
          title="Read-Only Curriculum"
          description="Curriculum sections, lessons, videos, and attachments can only be edited while the course is in draft state."
        />
      )}

      {isDraft && (
        <Card className="rounded-lg shadow-card border-hairline" styles={{ body: { padding: 16 } }}>
          <form onSubmit={handleAddSection} className="flex flex-col sm:flex-row gap-sm">
            <Input
              placeholder="New section title (e.g. Introduction & Setup)..."
              value={newSectionTitle}
              disabled={sections.length >= 200}
              onChange={(e) => setNewSectionTitle(e.target.value)}
            />
            <DashboardButton
              htmlType="submit"
              variant="primary"
              icon={<PlusOutlined />}
              loading={isCreatingSection}
              disabled={sections.length >= 200}
            >
              Add Section
            </DashboardButton>
          </form>
        </Card>
      )}

      {sections.length === 0 ? (
        <DashboardEmptyState
          title="No sections yet"
          description="Add your first section above, then populate it with lessons, videos, and PDF attachments."
        />
      ) : (
        <div className="space-y-md">
          {sections.map((section, secIndex) => (
            <Card
              key={section.id}
              className="rounded-lg shadow-card border-border overflow-hidden"
              styles={{ body: { padding: 0 } }}
            >
              <div className="bg-surface-subtle px-lg py-md border-b border-border flex flex-wrap items-center justify-between gap-sm">
                {editingSectionId === section.id ? (
                  <div className="flex items-center gap-xs flex-1">
                    <Input
                      value={editingSectionTitle}
                      onChange={(e) => setEditingSectionTitle(e.target.value)}
                    />
                    <DashboardButton
                      variant="primary"
                      size="small"
                      onClick={() => handleSaveSectionEdit(section.id)}
                    >
                      Save
                    </DashboardButton>
                    <DashboardButton
                      variant="secondary"
                      size="small"
                      onClick={() => setEditingSectionId(null)}
                    >
                      Cancel
                    </DashboardButton>
                  </div>
                ) : (
                  <div className="min-w-0">
                    <h2 className="text-[16px] font-semibold text-ink m-0">
                      Section {secIndex + 1}: {section.title}
                    </h2>
                    <span className="text-[12px] text-ink-muted">
                      {section.lessons.length} lessons
                    </span>
                  </div>
                )}

                {isDraft && editingSectionId !== section.id && (
                  <Space wrap size="small">
                    <DashboardButton
                      variant="secondary"
                      size="small"
                      icon={<ArrowUpOutlined />}
                      disabled={secIndex === 0}
                      onClick={() => handleMoveSection(secIndex, -1)}
                      aria-label="Move section up"
                    />
                    <DashboardButton
                      variant="secondary"
                      size="small"
                      icon={<ArrowDownOutlined />}
                      disabled={secIndex === sections.length - 1}
                      onClick={() => handleMoveSection(secIndex, 1)}
                      aria-label="Move section down"
                    />
                    <DashboardButton
                      variant="secondary"
                      size="small"
                      icon={<EditOutlined />}
                      onClick={() => {
                        setEditingSectionId(section.id);
                        setEditingSectionTitle(section.title);
                      }}
                    >
                      Rename
                    </DashboardButton>
                    <DashboardButton
                      variant="outline"
                      size="small"
                      icon={<PlusOutlined />}
                      disabled={section.lessons.length >= 200}
                      onClick={() => openCreateLessonModal(section.id)}
                    >
                      Add Lesson
                    </DashboardButton>
                    <DashboardButton
                      variant="secondary"
                      size="small"
                      icon={<DeleteOutlined />}
                      onClick={async () => {
                        try {
                          await deleteSection({
                            courseId: course.id,
                            sectionId: section.id,
                          }).unwrap();
                          void message.success('Section deleted.');
                        } catch (err) {
                          void message.error(parseApiError(err).message);
                        }
                      }}
                      aria-label="Delete section"
                    />
                  </Space>
                )}
              </div>

              <div className="divide-y divide-hairline">
                {section.lessons.length === 0 ? (
                  <div className="p-md text-[13px] text-ink-muted">
                    No lessons in this section yet.
                  </div>
                ) : (
                  section.lessons.map((lesson, lessonIdx) => {
                    const videoUploadProg = uploadProgressMap[lesson.id];
                    const pdfUploadProg = uploadProgressMap[`pdf-${lesson.id}`];
                    const canUploadVideo =
                      isDraft &&
                      lesson.videoStatus !== 'pending' &&
                      lesson.videoStatus !== 'processing' &&
                      lesson.videoStatus !== 'ready';

                    return (
                      <div key={lesson.id} className="p-md space-y-sm bg-surface">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-sm">
                          <div className="space-y-xxs min-w-0">
                            <div className="flex items-center gap-xs flex-wrap">
                              <span className="text-[14px] font-semibold text-ink">
                                {lessonIdx + 1}. {lesson.title}
                              </span>
                              {lesson.isPreview && (
                                <StatusBadge label="Preview" tone="teal" />
                              )}
                              <StatusBadge label={`Video: ${lesson.videoStatus}`} />
                              {typeof lesson.durationSeconds === 'number' &&
                                lesson.durationSeconds > 0 && (
                                  <span className="text-[12px] text-ink-muted">
                                    {formatDuration(lesson.durationSeconds)}
                                  </span>
                                )}
                            </div>
                          </div>

                          {isDraft && (
                            <Space wrap size="small">
                              <DashboardButton
                                variant="secondary"
                                size="small"
                                icon={<ArrowUpOutlined />}
                                disabled={lessonIdx === 0}
                                onClick={() =>
                                  handleMoveLesson(
                                    section.id,
                                    section.lessons,
                                    lessonIdx,
                                    -1,
                                  )
                                }
                                aria-label="Move lesson up"
                              />
                              <DashboardButton
                                variant="secondary"
                                size="small"
                                icon={<ArrowDownOutlined />}
                                disabled={lessonIdx === section.lessons.length - 1}
                                onClick={() =>
                                  handleMoveLesson(
                                    section.id,
                                    section.lessons,
                                    lessonIdx,
                                    1,
                                  )
                                }
                                aria-label="Move lesson down"
                              />
                              <DashboardButton
                                variant="secondary"
                                size="small"
                                icon={<EditOutlined />}
                                onClick={() => openEditLessonModal(lesson)}
                              >
                                Edit
                              </DashboardButton>

                              {canUploadVideo && (
                                <Upload
                                  accept="video/*"
                                  showUploadList={false}
                                  beforeUpload={(file) =>
                                    handleVideoUpload(lesson.id, file)
                                  }
                                >
                                  <DashboardButton
                                    variant="outline"
                                    size="small"
                                    icon={<VideoCameraAddOutlined />}
                                  >
                                    Upload Video
                                  </DashboardButton>
                                </Upload>
                              )}

                              {lesson.attachments.length === 0 ? (
                                <Upload
                                  accept="application/pdf,.pdf"
                                  showUploadList={false}
                                  beforeUpload={(file) =>
                                    handleAttachmentUpload(lesson.id, file)
                                  }
                                >
                                  <DashboardButton
                                    variant="secondary"
                                    size="small"
                                    icon={<FilePdfOutlined />}
                                  >
                                    Attach PDF
                                  </DashboardButton>
                                </Upload>
                              ) : (
                                <DashboardButton
                                  variant="secondary"
                                  size="small"
                                  icon={<DeleteOutlined />}
                                  onClick={async () => {
                                    try {
                                      await deleteMedia(lesson.attachments[0]).unwrap();
                                      void refetchCurriculum();
                                      void message.success('PDF removed.');
                                    } catch (err) {
                                      void message.error(parseApiError(err).message);
                                    }
                                  }}
                                >
                                  Remove PDF
                                </DashboardButton>
                              )}

                              <DashboardButton
                                variant="secondary"
                                size="small"
                                icon={<DeleteOutlined />}
                                onClick={async () => {
                                  try {
                                    await deleteLesson({
                                      courseId: course.id,
                                      lessonId: lesson.id,
                                    }).unwrap();
                                    void message.success('Lesson deleted.');
                                  } catch (err) {
                                    void message.error(parseApiError(err).message);
                                  }
                                }}
                                aria-label="Delete lesson"
                              />
                            </Space>
                          )}
                        </div>

                        {lesson.videoStatus === 'unavailable' && (
                          <Alert
                            type="error"
                            showIcon
                            title="Video unavailable on Mux — upload a replacement video or delete this lesson."
                          />
                        )}

                        {videoUploadProg && (
                          <UploadProgressCard
                            fileName={videoUploadProg.fileName}
                            percent={videoUploadProg.percent}
                            statusLabel={videoUploadProg.statusLabel}
                            isError={videoUploadProg.isError}
                            isComplete={videoUploadProg.isComplete}
                          />
                        )}

                        {pdfUploadProg && (
                          <UploadProgressCard
                            fileName={pdfUploadProg.fileName}
                            percent={pdfUploadProg.percent}
                            statusLabel={pdfUploadProg.statusLabel}
                            isError={pdfUploadProg.isError}
                            isComplete={pdfUploadProg.isComplete}
                          />
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Lesson Create / Edit Modal */}
      <DashboardModal
        open={Boolean(lessonModalSectionId || editingLesson)}
        onCancel={() => {
          setLessonModalSectionId(null);
          setEditingLesson(null);
        }}
        title={editingLesson ? 'Edit Lesson' : 'Add Lesson'}
      >
        <form onSubmit={handleSaveLessonModal} className="space-y-md pt-sm">
          <DashboardInput
            label="Lesson Title"
            value={lessonTitle}
            onChange={(e) => setLessonTitle(e.target.value)}
            placeholder="e.g. Installing Node.js and TypeScript"
          />

          <div className="space-y-xxs">
            <label className="block text-[14px] font-semibold text-ink">
              Lesson Notes (Optional)
            </label>
            <Input.TextArea
              rows={4}
              value={lessonDescription}
              onChange={(e) => setLessonDescription(e.target.value)}
              placeholder="Up to 10,000 characters"
            />
          </div>

          <div className="flex items-center justify-between gap-sm rounded-md bg-surface-subtle p-sm border border-border">
            <div>
              <p className="text-[14px] font-semibold text-ink m-0">Free Preview</p>
              <p className="text-[12px] text-ink-muted m-0">
                Allow anonymous visitors to watch this lesson on the course details page.
              </p>
            </div>
            <Switch checked={lessonPreview} onChange={setLessonPreview} />
          </div>

          <div className="flex justify-end gap-xs pt-xs">
            <DashboardButton
              variant="secondary"
              onClick={() => {
                setLessonModalSectionId(null);
                setEditingLesson(null);
              }}
            >
              Cancel
            </DashboardButton>
            <DashboardButton
              htmlType="submit"
              variant="primary"
              loading={isCreatingLesson}
            >
              {editingLesson ? 'Save Lesson' : 'Add Lesson'}
            </DashboardButton>
          </div>
        </form>
      </DashboardModal>
    </div>
  );
}
