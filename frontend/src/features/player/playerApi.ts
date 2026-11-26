import { baseApi } from '@/app/baseApi';
import type { EnrollmentDto } from '@/features/checkout/checkoutApi';
import type { ProgressSummaryDto } from '@/features/library/libraryApi';
import type { ApiSuccessEnvelope } from '@/types/api';

export interface LessonProgressDto {
  lessonId: string;
  completed: boolean;
  completedAt: string | null;
}

export interface AttachmentDownloadDto {
  url: string;
  expiresAt: string;
}

export const playerApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    setLessonCompletion: builder.mutation<
      ApiSuccessEnvelope<{
        lessonProgress: LessonProgressDto;
        enrollment: EnrollmentDto;
        progress: ProgressSummaryDto;
      }>,
      { courseId: string; lessonId: string; completed: boolean }
    >({
      query: ({ courseId, lessonId, completed }) => ({
        url: `/users/me/courses/${encodeURIComponent(courseId)}/lessons/${encodeURIComponent(lessonId)}/progress`,
        method: 'PUT',
        body: { completed },
      }),
      invalidatesTags: (_res, _err, { courseId }) => [
        'Enrollment',
        { type: 'Enrollment', id: courseId },
      ],
    }),
    setLastLesson: builder.mutation<
      ApiSuccessEnvelope<{
        enrollment: EnrollmentDto;
        progress: ProgressSummaryDto;
      }>,
      { courseId: string; lessonId: string }
    >({
      query: ({ courseId, lessonId }) => ({
        url: `/users/me/courses/${encodeURIComponent(courseId)}/last-lesson`,
        method: 'PUT',
        body: { lessonId },
      }),
      invalidatesTags: (_res, _err, { courseId }) => [
        { type: 'Enrollment', id: courseId },
      ],
    }),
    getAttachmentDownloadUrl: builder.query<
      ApiSuccessEnvelope<AttachmentDownloadDto>,
      { lessonId: string; assetId: string }
    >({
      query: ({ lessonId, assetId }) =>
        `/lessons/${encodeURIComponent(lessonId)}/attachments/${encodeURIComponent(assetId)}/download`,
    }),
  }),
});

export const {
  useSetLessonCompletionMutation,
  useSetLastLessonMutation,
  useLazyGetAttachmentDownloadUrlQuery,
} = playerApi;
