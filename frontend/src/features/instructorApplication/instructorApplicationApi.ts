import { baseApi } from '@/app/baseApi';
import type { ApiSuccessEnvelope } from '@/types/api';

export interface InstructorLinkDto {
  label: string;
  url: string;
}

export interface InstructorApplicationDto {
  id: string;
  userId: string;
  bio: string;
  expertise: string;
  links: InstructorLinkDto[];
  status: 'pending' | 'approved' | 'rejected';
  reviewedBy: string | null;
  rejectionReason: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateInstructorApplicationRequest {
  bio: string;
  expertise: string;
  links?: InstructorLinkDto[];
}

export const instructorApplicationApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getMyInstructorApplication: builder.query<
      ApiSuccessEnvelope<{ application: InstructorApplicationDto | null }>,
      void
    >({
      query: () => '/instructor-applications/me',
      providesTags: ['InstructorApplication'],
    }),
    submitInstructorApplication: builder.mutation<
      ApiSuccessEnvelope<{ application: InstructorApplicationDto }>,
      CreateInstructorApplicationRequest
    >({
      query: (body) => ({
        url: '/instructor-applications',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['InstructorApplication', 'User'],
    }),
  }),
});

export const {
  useGetMyInstructorApplicationQuery,
  useSubmitInstructorApplicationMutation,
} = instructorApplicationApi;
