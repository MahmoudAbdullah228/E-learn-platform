import { baseApi } from '@/app/baseApi';
import type { ApiSuccessEnvelope } from '@/types/api';

export interface CheckoutOrderDto {
  id: string;
  courseId: string;
  courseTitle: string;
  amountMinor: number;
  currency: string;
  status: 'pending' | 'paid' | 'failed' | 'expired' | 'refunded' | string;
  expiresAt: string;
  createdAt: string;
}

export interface CheckoutResponseData {
  checkoutUrl: string;
  order: CheckoutOrderDto;
}

export interface EnrollmentDto {
  id: string;
  courseId: string;
  sourceOrderId: string | null;
  status: 'active' | 'revoked';
  enrolledAt: string;
  completedAt: string | null;
  revokedAt: string | null;
  revocationReason: 'refund' | 'restricted' | null;
  lastLessonId: string | null;
}

export const checkoutApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    startCourseCheckout: builder.mutation<
      ApiSuccessEnvelope<CheckoutResponseData>,
      string
    >({
      query: (courseId) => ({
        url: `/courses/${encodeURIComponent(courseId)}/checkout`,
        method: 'POST',
        body: {},
      }),
      invalidatesTags: ['Order'],
    }),
    enrollFreeCourse: builder.mutation<
      ApiSuccessEnvelope<{ enrollment: EnrollmentDto }>,
      string
    >({
      query: (courseId) => ({
        url: `/courses/${encodeURIComponent(courseId)}/enroll`,
        method: 'POST',
        body: {},
      }),
      invalidatesTags: ['Enrollment'],
    }),
  }),
});

export const {
  useStartCourseCheckoutMutation,
  useEnrollFreeCourseMutation,
} = checkoutApi;
