import { baseApi } from '@/app/baseApi';
import type { AdminCourseRevisionSummaryDto } from '@/features/adminCourses/adminCoursesApi';
import type { UpdateCourseDraftInput } from '@/features/instructorCourses/instructorCoursesApi';
import type { ApiSuccessEnvelope } from '@/types/api';

export interface RevisionSectionItemDto {
  id: string;
  logicalId: string;
  title: string;
  position: number;
}

export interface RevisionLessonItemDto {
  id: string;
  logicalId: string;
  sectionId: string;
  title: string;
  description: string;
  position: number;
  isPreview: boolean;
  videoStatus: string;
  durationSeconds: number | null;
  attachments: string[];
}

export const courseRevisionsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    createPublishedCourseRevision: builder.mutation<
      ApiSuccessEnvelope<AdminCourseRevisionSummaryDto>,
      string
    >({
      query: (courseId) => ({
        url: `/instructor/courses/${encodeURIComponent(courseId)}/revisions`,
        method: 'POST',
      }),
      invalidatesTags: ['CourseRevision'],
    }),
    getPublishedCourseRevision: builder.query<
      ApiSuccessEnvelope<AdminCourseRevisionSummaryDto>,
      { courseId: string; revisionId: string }
    >({
      query: ({ courseId, revisionId }) =>
        `/instructor/courses/${encodeURIComponent(courseId)}/revisions/${encodeURIComponent(revisionId)}`,
      providesTags: (_res, _err, { revisionId }) => [
        { type: 'CourseRevision', id: revisionId },
      ],
    }),
    updateRevisionMetadata: builder.mutation<
      ApiSuccessEnvelope<AdminCourseRevisionSummaryDto>,
      {
        courseId: string;
        revisionId: string;
        expectedRevision: number;
        patch: UpdateCourseDraftInput;
      }
    >({
      query: ({ courseId, revisionId, expectedRevision, patch }) => ({
        url: `/instructor/courses/${encodeURIComponent(courseId)}/revisions/${encodeURIComponent(revisionId)}`,
        method: 'PATCH',
        body: { expectedRevision, ...patch },
      }),
      invalidatesTags: (_res, _err, { revisionId }) => [
        { type: 'CourseRevision', id: revisionId },
      ],
    }),
    listRevisionSections: builder.query<
      ApiSuccessEnvelope<{ items: RevisionSectionItemDto[]; nextAfter: number | null }>,
      { courseId: string; revisionId: string }
    >({
      query: ({ courseId, revisionId }) =>
        `/instructor/courses/${encodeURIComponent(courseId)}/revisions/${encodeURIComponent(revisionId)}/sections`,
      providesTags: (_res, _err, { revisionId }) => [
        { type: 'CourseRevision', id: `${revisionId}-sections` },
      ],
    }),
    listRevisionSectionLessons: builder.query<
      ApiSuccessEnvelope<{ items: RevisionLessonItemDto[]; nextAfter: number | null }>,
      { courseId: string; revisionId: string; sectionId: string }
    >({
      query: ({ courseId, revisionId, sectionId }) =>
        `/instructor/courses/${encodeURIComponent(courseId)}/revisions/${encodeURIComponent(revisionId)}/sections/${encodeURIComponent(sectionId)}/lessons`,
      providesTags: (_res, _err, { revisionId }) => [
        { type: 'CourseRevision', id: `${revisionId}-sections` },
      ],
    }),
    submitPublishedCourseRevision: builder.mutation<
      ApiSuccessEnvelope<AdminCourseRevisionSummaryDto>,
      { courseId: string; revisionId: string; expectedRevision: number }
    >({
      query: ({ courseId, revisionId, expectedRevision }) => ({
        url: `/instructor/courses/${encodeURIComponent(courseId)}/revisions/${encodeURIComponent(revisionId)}/submit`,
        method: 'POST',
        body: { expectedRevision },
      }),
      invalidatesTags: (_res, _err, { revisionId }) => [
        'CourseRevision',
        { type: 'CourseRevision', id: revisionId },
      ],
    }),
    reopenPublishedCourseRevision: builder.mutation<
      ApiSuccessEnvelope<AdminCourseRevisionSummaryDto>,
      { courseId: string; revisionId: string; expectedRevision: number }
    >({
      query: ({ courseId, revisionId, expectedRevision }) => ({
        url: `/instructor/courses/${encodeURIComponent(courseId)}/revisions/${encodeURIComponent(revisionId)}/reopen`,
        method: 'POST',
        body: { expectedRevision },
      }),
      invalidatesTags: (_res, _err, { revisionId }) => [
        { type: 'CourseRevision', id: revisionId },
      ],
    }),
    discardPublishedCourseRevision: builder.mutation<
      ApiSuccessEnvelope<AdminCourseRevisionSummaryDto>,
      { courseId: string; revisionId: string; expectedRevision: number }
    >({
      query: ({ courseId, revisionId, expectedRevision }) => ({
        url: `/instructor/courses/${encodeURIComponent(courseId)}/revisions/${encodeURIComponent(revisionId)}/discard`,
        method: 'POST',
        body: { expectedRevision },
      }),
      invalidatesTags: ['CourseRevision'],
    }),
  }),
});

export const {
  useCreatePublishedCourseRevisionMutation,
  useGetPublishedCourseRevisionQuery,
  useUpdateRevisionMetadataMutation,
  useListRevisionSectionsQuery,
  useSubmitPublishedCourseRevisionMutation,
  useReopenPublishedCourseRevisionMutation,
  useDiscardPublishedCourseRevisionMutation,
} = courseRevisionsApi;
