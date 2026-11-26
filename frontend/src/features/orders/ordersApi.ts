import { baseApi } from '@/app/baseApi';
import type { CheckoutOrderDto } from '@/features/checkout/checkoutApi';
import type { ApiSuccessEnvelope, PaginationDto } from '@/types/api';

export interface OrderRefundSummaryDto {
  id: string;
  kind: string;
  status: string;
  amountMinor: number;
  currency: string;
  createdAt: string;
  completedAt: string | null;
}

export interface StudentOrderDto extends CheckoutOrderDto {
  paidAt: string | null;
  latestRefund: OrderRefundSummaryDto | null;
}

export interface OrderPaymentDto {
  id: string;
  provider: string;
  status: string;
  amountMinor: number;
  currency: string;
  paidAt: string | null;
}

export const ordersApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    listMyOrders: builder.query<
      ApiSuccessEnvelope<{ orders: StudentOrderDto[]; pagination: PaginationDto }>,
      { status?: string; page?: number; limit?: number } | void
    >({
      query: (params) => {
        const queryParams: Record<string, string | number> = {
          page: params?.page ?? 1,
          limit: params?.limit ?? 20,
        };
        if (params?.status && params.status !== 'all') {
          queryParams.status = params.status;
        }
        return {
          url: '/users/me/orders',
          params: queryParams,
        };
      },
      providesTags: ['Order'],
    }),
    getMyOrderDetail: builder.query<
      ApiSuccessEnvelope<{ order: StudentOrderDto; payment: OrderPaymentDto | null }>,
      string
    >({
      query: (orderId) => `/users/me/orders/${encodeURIComponent(orderId)}`,
      providesTags: (_res, _err, orderId) => [{ type: 'Order', id: orderId }],
    }),
  }),
});

export const { useListMyOrdersQuery, useGetMyOrderDetailQuery } = ordersApi;
