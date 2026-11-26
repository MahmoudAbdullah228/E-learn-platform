import { baseApi } from '@/app/baseApi';
import type { CourseStatus, InstructorCourseDto } from '@/features/instructorCourses/instructorCoursesApi';
import type { ApiSuccessEnvelope, PaginationDto } from '@/types/api';

export interface AdminCoursePolicyDetailDto extends InstructorCourseDto {
  contentRevision: number;
}

export interface AdminCourseReviewDetailResponse {
  course: AdminCoursePolicyDetailDto;
  instructor: { id: string; name: string; email: string } | null;
  sections: {
    id: string;
    title: string;
    position: number;
    lessons: {
      id: string;
      title: string;
      description: string;
      position: number;
      videoStatus: string;
      durationSeconds: number | null;
      isPreview: boolean;
      attachments: string[];
    }[];
  }[];
  reviewEvents: {
    id: string;
    actorId: string | null;
    action: string;
    fromStatus: string | null;
    toStatus: string;
    reason: string | null;
    occurredAt: string;
  }[];
}

export interface AdminCourseRevisionSummaryDto {
  id: string;
  courseId: string;
  number: number;
  status: string;
  revision: number;
  baseContentRevision: number;
  metadata: Record<string, unknown>;
  rejectionReason: string | null;
}

export interface RevisionDiffChangeDto {
  kind: string;
  id: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  videoChanged: boolean;
}

export interface AdminCourseRevisionDetailDto extends AdminCourseRevisionSummaryDto {
  currentContentRevision: number;
  history: {
    action: string;
    actorId: string | null;
    occurredAt: string;
    reason: string | null;
  }[];
  changes: RevisionDiffChangeDto[];
}

export const adminCoursesApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    listAdminCourses: builder.query<
      ApiSuccessEnvelope<{ courses: InstructorCourseDto[]; pagination: PaginationDto }>,
      { status?: CourseStatus; page?: number; limit?: number } | void
    >({
      query: (params) => ({
        url: '/admin/courses',
        params: {
          status: params?.status ?? 'pending_review',
          page: params?.page ?? 1,
          limit: params?.limit ?? 20,
        },
      }),
      providesTags: ['Course'],
    }),
    getAdminCourseDetail: builder.query<
      ApiSuccessEnvelope<AdminCourseReviewDetailResponse>,
      string
    >({
      query: (courseId) => `/admin/courses/${encodeURIComponent(courseId)}`,
      providesTags: (_res, _err, courseId) => [{ type: 'Course', id: courseId }],
    }),
    reviewAdminCourse: builder.mutation<
      ApiSuccessEnvelope<{ course: InstructorCourseDto }>,
      {
        courseId: string;
        body: { decision: 'approve' } | { decision: 'reject'; reason: string };
      }
    >({
      query: ({ courseId, body }) => ({
        url: `/admin/courses/${encodeURIComponent(courseId)}/review`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: (_res, _err, { courseId }) => [
        'Course',
        { type: 'Course', id: courseId },
        'Catalog',
        'Finance',
      ],
    }),
    archiveAdminCourse: builder.mutation<
      ApiSuccessEnvelope<{ course: InstructorCourseDto }>,
      { courseId: string; reason: string; expectedRevision: number }
    >({
      query: ({ courseId, reason, expectedRevision }) => ({
        url: `/admin/courses/${encodeURIComponent(courseId)}/archive`,
        method: 'POST',
        body: { reason, expectedRevision },
      }),
      invalidatesTags: (_res, _err, { courseId }) => [
        'Course',
        { type: 'Course', id: courseId },
        'Catalog',
      ],
    }),
    changeAdminCourseAccessPolicy: builder.mutation<
      ApiSuccessEnvelope<{ course: InstructorCourseDto }>,
      {
        courseId: string;
        accessStatus: 'available' | 'blocked';
        reason: string;
        expectedRevision: number;
      }
    >({
      query: ({ courseId, accessStatus, reason, expectedRevision }) => ({
        url: `/admin/courses/${encodeURIComponent(courseId)}/access-policy`,
        method: 'PATCH',
        body: { accessStatus, reason, expectedRevision },
      }),
      invalidatesTags: (_res, _err, { courseId }) => [
        'Course',
        { type: 'Course', id: courseId },
        'Catalog',
      ],
    }),
    listAdminCourseRevisions: builder.query<
      ApiSuccessEnvelope<{
        items: AdminCourseRevisionSummaryDto[];
        nextAfter: string | null;
      }>,
      { after?: string } | void
    >({
      query: (params) => ({
        url: '/admin/course-revisions',
        params: params?.after ? { after: params.after } : undefined,
      }),
      providesTags: ['CourseRevision'],
    }),
    getAdminCourseRevisionDetail: builder.query<
      ApiSuccessEnvelope<AdminCourseRevisionDetailDto>,
      string
    >({
      query: (revisionId) =>
        `/admin/course-revisions/${encodeURIComponent(revisionId)}`,
      providesTags: (_res, _err, revisionId) => [
        { type: 'CourseRevision', id: revisionId },
      ],
    }),
    approveAdminCourseRevision: builder.mutation<
      ApiSuccessEnvelope<AdminCourseRevisionSummaryDto>,
      {
        revisionId: string;
        expectedRevision: number;
        baseContentRevision: number;
      }
    >({
      query: ({ revisionId, expectedRevision, baseContentRevision }) => ({
        url: `/admin/course-revisions/${encodeURIComponent(revisionId)}/approve`,
        method: 'POST',
        body: { expectedRevision, baseContentRevision },
      }),
      invalidatesTags: ['CourseRevision', 'Course', 'Catalog'],
    }),
    rejectAdminCourseRevision: builder.mutation<
      ApiSuccessEnvelope<AdminCourseRevisionSummaryDto>,
      {
        revisionId: string;
        expectedRevision: number;
        baseContentRevision: number;
        reason: string;
      }
    >({
      query: ({ revisionId, expectedRevision, baseContentRevision, reason }) => ({
        url: `/admin/course-revisions/${encodeURIComponent(revisionId)}/reject`,
        method: 'POST',
        body: { expectedRevision, baseContentRevision, reason },
      }),
      invalidatesTags: ['CourseRevision'],
    }),
  }),
});

export const {
  useListAdminCoursesQuery,
  useGetAdminCourseDetailQuery,
  useReviewAdminCourseMutation,
  useArchiveAdminCourseMutation,
  useChangeAdminCourseAccessPolicyMutation,
  useListAdminCourseRevisionsQuery,
  useGetAdminCourseRevisionDetailQuery,
  useApproveAdminCourseRevisionMutation,
  useRejectAdminCourseRevisionMutation,
} = adminCoursesApi;
