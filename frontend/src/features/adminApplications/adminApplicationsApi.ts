import { baseApi } from '@/app/baseApi';
import type { InstructorApplicationDto } from '@/features/instructorApplication/instructorApplicationApi';
import type { ApiSuccessEnvelope, PaginationDto } from '@/types/api';

export interface AdminInstructorApplicationDto extends InstructorApplicationDto {
  applicant: {
    id: string;
    name: string;
    email: string;
  } | null;
}

export const adminApplicationsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    listAdminInstructorApplications: builder.query<
      ApiSuccessEnvelope<{
        applications: AdminInstructorApplicationDto[];
        pagination: PaginationDto;
      }>,
      { status?: 'pending' | 'approved' | 'rejected'; page?: number; limit?: number } | void
    >({
      query: (params) => {
        const queryParams: Record<string, string | number> = {
          page: params?.page ?? 1,
          limit: params?.limit ?? 20,
        };
        if (params?.status) {
          queryParams.status = params.status;
        }
        return {
          url: '/admin/instructor-applications',
          params: queryParams,
        };
      },
      providesTags: ['InstructorApplication'],
    }),
    reviewInstructorApplication: builder.mutation<
      ApiSuccessEnvelope<{ application: InstructorApplicationDto }>,
      {
        applicationId: string;
        body:
          | { status: 'approved' }
          | { status: 'rejected'; rejectionReason: string };
      }
    >({
      query: ({ applicationId, body }) => ({
        url: `/admin/instructor-applications/${encodeURIComponent(applicationId)}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['InstructorApplication', 'Finance'],
    }),
  }),
});

export const {
  useListAdminInstructorApplicationsQuery,
  useReviewInstructorApplicationMutation,
} = adminApplicationsApi;
