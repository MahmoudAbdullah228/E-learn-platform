import { baseApi } from '@/app/baseApi';
import type { CategoryDto } from '@/features/catalog/catalogApi';
import type { ApiSuccessEnvelope, PaginationDto } from '@/types/api';

export const adminCategoriesApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    listAdminCategories: builder.query<
      ApiSuccessEnvelope<{ categories: CategoryDto[]; pagination: PaginationDto }>,
      { isActive?: boolean; page?: number; limit?: number } | void
    >({
      query: (params) => {
        const queryParams: Record<string, string | number> = {
          page: params?.page ?? 1,
          limit: params?.limit ?? 50,
        };
        if (params?.isActive !== undefined) {
          queryParams.isActive = String(params.isActive);
        }
        return {
          url: '/admin/categories',
          params: queryParams,
        };
      },
      providesTags: ['Category'],
    }),
    createAdminCategory: builder.mutation<
      ApiSuccessEnvelope<{ category: CategoryDto }>,
      { name: string; slug: string }
    >({
      query: (body) => ({
        url: '/admin/categories',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Category'],
    }),
    updateAdminCategory: builder.mutation<
      ApiSuccessEnvelope<{ category: CategoryDto }>,
      {
        categoryId: string;
        patch: { name?: string; slug?: string; isActive?: boolean };
      }
    >({
      query: ({ categoryId, patch }) => ({
        url: `/admin/categories/${encodeURIComponent(categoryId)}`,
        method: 'PATCH',
        body: patch,
      }),
      invalidatesTags: ['Category'],
    }),
  }),
});

export const {
  useListAdminCategoriesQuery,
  useCreateAdminCategoryMutation,
  useUpdateAdminCategoryMutation,
} = adminCategoriesApi;
