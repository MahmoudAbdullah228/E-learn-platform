import { baseApi } from '@/app/baseApi';
import type { CategoryDto, PublicInstructorProfile } from '@/features/catalog/catalogApi';
import type { InstructorLinkDto } from '@/features/instructorApplication/instructorApplicationApi';
import type { ApiSuccessEnvelope, PaginationDto } from '@/types/api';

export type CourseStatus =
  | 'draft'
  | 'pending_review'
  | 'published'
  | 'rejected'
  | 'unavailable'
  | 'archived';

export type CourseLevel = 'beginner' | 'intermediate' | 'advanced' | 'all_levels';
export type CourseLanguage = 'ar' | 'en';

export interface InstructorCourseDto {
  id: string;
  instructorId: string;
  categoryId: string;
  category: CategoryDto | null;
  title: string;
  slug: string;
  description: string;
  shortDescription: string;
  coverAssetId: string | null;
  level: CourseLevel | null;
  language: CourseLanguage | null;
  requirements: string[];
  learningOutcomes: string[];
  priceMinor: number;
  currency: 'EGP';
  status: CourseStatus;
  accessStatus: string;
  revision: number;
  archivedAt: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  publishedAt: string | null;
  unavailableAt: string | null;
  reviewedBy: string | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCourseDraftInput {
  title: string;
  categoryId: string;
  description: string;
  shortDescription?: string;
  level?: CourseLevel | null;
  language?: CourseLanguage | null;
  requirements?: string[];
  learningOutcomes?: string[];
  priceMinor: number;
}

export type UpdateCourseDraftInput = Partial<CreateCourseDraftInput>;

export interface UpdateInstructorProfileInput {
  bio?: string;
  expertise?: string;
  links?: InstructorLinkDto[];
}

export const instructorCoursesApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    listInstructorCourses: builder.query<
      ApiSuccessEnvelope<{ courses: InstructorCourseDto[]; pagination: PaginationDto }>,
      { status?: CourseStatus; page?: number; limit?: number } | void
    >({
      query: (params) => ({
        url: '/instructor/courses',
        params: {
          status: params?.status ?? 'draft',
          page: params?.page ?? 1,
          limit: params?.limit ?? 20,
        },
      }),
      providesTags: ['Course'],
    }),
    getInstructorCourse: builder.query<
      ApiSuccessEnvelope<{ course: InstructorCourseDto }>,
      string
    >({
      query: (courseId) => `/instructor/courses/${encodeURIComponent(courseId)}`,
      providesTags: (_res, _err, courseId) => [{ type: 'Course', id: courseId }],
    }),
    createInstructorCourse: builder.mutation<
      ApiSuccessEnvelope<{ course: InstructorCourseDto }>,
      CreateCourseDraftInput
    >({
      query: (body) => ({
        url: '/instructor/courses',
        method: 'POST',
        body: { ...body, currency: 'EGP' },
      }),
      invalidatesTags: ['Course'],
    }),
    updateInstructorCourse: builder.mutation<
      ApiSuccessEnvelope<{ course: InstructorCourseDto }>,
      { courseId: string; patch: UpdateCourseDraftInput }
    >({
      query: ({ courseId, patch }) => ({
        url: `/instructor/courses/${encodeURIComponent(courseId)}`,
        method: 'PATCH',
        body: patch,
      }),
      invalidatesTags: (_res, _err, { courseId }) => [
        'Course',
        { type: 'Course', id: courseId },
      ],
    }),
    submitCourseForReview: builder.mutation<
      ApiSuccessEnvelope<{ course: InstructorCourseDto }>,
      string
    >({
      query: (courseId) => ({
        url: `/instructor/courses/${encodeURIComponent(courseId)}/submit-review`,
        method: 'POST',
        body: {},
      }),
      invalidatesTags: (_res, _err, courseId) => [
        'Course',
        { type: 'Course', id: courseId },
      ],
    }),
    reopenCourse: builder.mutation<
      ApiSuccessEnvelope<{ course: InstructorCourseDto }>,
      string
    >({
      query: (courseId) => ({
        url: `/instructor/courses/${encodeURIComponent(courseId)}/reopen`,
        method: 'POST',
        body: {},
      }),
      invalidatesTags: (_res, _err, courseId) => [
        'Course',
        { type: 'Course', id: courseId },
      ],
    }),
    updateInstructorProfile: builder.mutation<
      ApiSuccessEnvelope<{ instructor: PublicInstructorProfile }>,
      UpdateInstructorProfileInput
    >({
      query: (body) => ({
        url: '/instructor/profile',
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['InstructorProfile'],
    }),
  }),
});

export const {
  useListInstructorCoursesQuery,
  useGetInstructorCourseQuery,
  useCreateInstructorCourseMutation,
  useUpdateInstructorCourseMutation,
  useSubmitCourseForReviewMutation,
  useReopenCourseMutation,
  useUpdateInstructorProfileMutation,
} = instructorCoursesApi;
