import { baseApi } from '@/app/baseApi';
import type { ApiSuccessEnvelope, PaginationDto } from '@/types/api';

export interface CategoryDto {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface CatalogInstructorSummary {
  id: string;
  name: string;
  bio?: string | null;
  expertise?: string | null;
  links?: { label: string; url: string }[];
}

export interface CatalogCourseSummary {
  id: string;
  slug: string;
  title: string;
  shortDescription: string;
  category: { id: string; name: string; slug: string } | null;
  instructor: CatalogInstructorSummary | null;
  coverUrl: string | null;
  level: 'beginner' | 'intermediate' | 'advanced' | 'all_levels' | null;
  language: 'ar' | 'en' | null;
  priceMinor: number;
  currency: string;
  publishedAt: string | null;
}

export interface CatalogLessonOutline {
  id: string;
  title: string;
  description: string;
  position: number;
  durationSeconds: number | null;
  isPreview: boolean;
}

export interface CatalogSectionOutline {
  id: string;
  title: string;
  position: number;
  lessons: CatalogLessonOutline[];
}

export interface CatalogCourseDetails extends CatalogCourseSummary {
  description: string;
  requirements: string[];
  learningOutcomes: string[];
  sectionCount: number;
  lessonCount: number;
  totalDurationSeconds: number | null;
  unknownDurationCount: number;
  sections: CatalogSectionOutline[];
}

export interface PublicInstructorProfile {
  id: string;
  name: string;
  avatarAssetId: string | null;
  avatarUrl: string | null;
  bio: string;
  expertise: string;
  links: { label: string; url: string }[];
}

export interface PlaybackCredentials {
  playbackId: string;
  token: string;
  expiresAt: string;
}

export interface CatalogListParams {
  q?: string;
  categoryId?: string;
  pricing?: 'all' | 'free' | 'paid';
  page?: number;
  limit?: number;
}

export const catalogApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    listPublicCategories: builder.query<
      ApiSuccessEnvelope<{ categories: CategoryDto[]; pagination: PaginationDto }>,
      { page?: number; limit?: number } | void
    >({
      query: (params) => ({
        url: '/categories',
        params: {
          page: params?.page ?? 1,
          limit: params?.limit ?? 20,
        },
      }),
      providesTags: ['Category'],
    }),
    listCatalogCourses: builder.query<
      ApiSuccessEnvelope<{ courses: CatalogCourseSummary[]; pagination: PaginationDto }>,
      CatalogListParams | void
    >({
      query: (params) => {
        const queryParams: Record<string, string | number> = {
          pricing: params?.pricing ?? 'all',
          page: params?.page ?? 1,
          limit: params?.limit ?? 12,
        };
        const trimmedQ = params?.q?.trim();
        if (trimmedQ) {
          queryParams.q = trimmedQ;
        }
        if (params?.categoryId) {
          queryParams.categoryId = params.categoryId;
        }
        return {
          url: '/courses',
          params: queryParams,
        };
      },
      providesTags: ['Catalog'],
    }),
    getCourseBySlug: builder.query<
      ApiSuccessEnvelope<{ course: CatalogCourseDetails }>,
      string
    >({
      query: (slug) => `/courses/${encodeURIComponent(slug)}`,
      providesTags: (_result, _err, slug) => [{ type: 'Catalog', id: slug }],
    }),
    getPublicInstructor: builder.query<
      ApiSuccessEnvelope<{ instructor: PublicInstructorProfile }>,
      string
    >({
      query: (instructorId) => `/instructors/${encodeURIComponent(instructorId)}`,
      providesTags: (_result, _err, id) => [{ type: 'InstructorProfile', id }],
    }),
    getLessonPlayback: builder.query<
      ApiSuccessEnvelope<PlaybackCredentials>,
      string
    >({
      query: (lessonId) => `/lessons/${encodeURIComponent(lessonId)}/playback`,
    }),
  }),
});

export const {
  useListPublicCategoriesQuery,
  useListCatalogCoursesQuery,
  useGetCourseBySlugQuery,
  useGetPublicInstructorQuery,
  useGetLessonPlaybackQuery,
  useLazyGetLessonPlaybackQuery,
} = catalogApi;
