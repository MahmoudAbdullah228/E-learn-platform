import { baseApi } from '@/app/baseApi';
import type { OrderPaymentDto, StudentOrderDto } from '@/features/orders/ordersApi';
import type { ApiSuccessEnvelope, PaginationDto } from '@/types/api';

export interface AdminOrderDto extends StudentOrderDto {
  studentId: string;
  instructorId: string;
  commissionBps: number;
  platformAmountMinor: number;
  instructorAmountMinor: number;
}

export interface AdminOrderPaymentDto extends OrderPaymentDto {
  paymentConfirmedAt: string | null;
  paymentIntentId: string | null;
  checkoutSessionId: string | null;
}

export interface AdminOrderRefundDto {
  id: string;
  kind: string;
  status: string;
  amountMinor: number;
  currency: string;
  createdAt: string;
  completedAt: string | null;
  providerRefundId: string | null;
}

export const adminOrdersApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    listAdminOrders: builder.query<
      ApiSuccessEnvelope<{ orders: AdminOrderDto[]; pagination: PaginationDto }>,
      {
        status?: string;
        studentId?: string;
        courseId?: string;
        page?: number;
        limit?: number;
      } | void
    >({
      query: (params) => {
        const queryParams: Record<string, string | number> = {
          page: params?.page ?? 1,
          limit: params?.limit ?? 20,
        };
        if (params?.status && params.status !== 'all') {
          queryParams.status = params.status;
        }
        if (params?.studentId) queryParams.studentId = params.studentId;
        if (params?.courseId) queryParams.courseId = params.courseId;
        return {
          url: '/admin/orders',
          params: queryParams,
        };
      },
      providesTags: ['Order'],
    }),
    getAdminOrderDetail: builder.query<
      ApiSuccessEnvelope<{
        order: AdminOrderDto;
        payment: AdminOrderPaymentDto | null;
        refunds: AdminOrderRefundDto[];
      }>,
      string
    >({
      query: (orderId) => `/admin/orders/${encodeURIComponent(orderId)}`,
      providesTags: (_res, _err, orderId) => [{ type: 'Order', id: orderId }],
    }),
  }),
});

export const { useListAdminOrdersQuery, useGetAdminOrderDetailQuery } =
  adminOrdersApi;
