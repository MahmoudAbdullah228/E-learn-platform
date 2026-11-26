import { baseApi } from '@/app/baseApi';
import type { EnrollmentDto } from '@/features/checkout/checkoutApi';
import type { ApiSuccessEnvelope, PaginationDto } from '@/types/api';

export interface ProgressSummaryDto {
  totalLessons: number;
  completedLessons: number;
  percentage: number;
  completedAt: string | null;
}

export interface LibraryCourseSummaryDto {
  id: string;
  slug: string;
  title: string;
  shortDescription: string;
  level: string | null;
  language: string | null;
  coverUrl: string | null;
  status: string;
  archivedAt: string | null;
}

export interface LibraryEntryDto {
  enrollment: EnrollmentDto;
  course: LibraryCourseSummaryDto | null;
  progress: ProgressSummaryDto | null;
  available: boolean;
  availabilityCode: string | null;
}

export interface LearningLessonDto {
  id: string;
  title: string;
  description: string;
  position: number;
  durationSeconds: number | null;
  videoStatus: string;
  isPreview: boolean;
  completed: boolean;
  completedAt: string | null;
  attachments: string[];
}

export interface LearningSectionDto {
  id: string;
  title: string;
  position: number;
  lessons: LearningLessonDto[];
}

export interface LearningCourseDetailDto {
  id: string;
  slug: string;
  title: string;
  shortDescription: string;
  description: string;
  requirements: string[];
  learningOutcomes: string[];
  level: string | null;
  language: string | null;
  status: string;
  sections: LearningSectionDto[];
}

export const libraryApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    listMyCourses: builder.query<
      ApiSuccessEnvelope<{ courses: LibraryEntryDto[]; pagination: PaginationDto }>,
      { status?: 'active' | 'revoked' | 'all'; page?: number; limit?: number } | void
    >({
      query: (params) => ({
        url: '/users/me/courses',
        params: {
          status: params?.status ?? 'active',
          page: params?.page ?? 1,
          limit: params?.limit ?? 50,
        },
      }),
      providesTags: ['Enrollment'],
    }),
    getMyLearningCourse: builder.query<
      ApiSuccessEnvelope<{
        enrollment: EnrollmentDto;
        progress: ProgressSummaryDto;
        course: LearningCourseDetailDto;
      }>,
      string
    >({
      query: (courseId) => `/users/me/courses/${encodeURIComponent(courseId)}`,
      providesTags: (_result, _err, courseId) => [
        { type: 'Enrollment', id: courseId },
      ],
    }),
  }),
});

export const { useListMyCoursesQuery, useGetMyLearningCourseQuery } = libraryApi;
