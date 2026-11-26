import { baseApi } from '@/app/baseApi';
import type { FinanceSummaryDto } from '@/features/adminUsers/adminUsersApi';
import type { ApiSuccessEnvelope } from '@/types/api';

export interface InstructorSaleDto {
  id: string;
  courseId: string;
  courseTitle: string;
  status: string;
  currency: 'EGP';
  amountMinor: number;
  platformCommissionMinor: number;
  instructorEarnedMinor: number;
  paidAt: string;
  paymentConfirmedAt: string | null;
  refund: { amountMinor: number; completedAt: string } | null;
}

export interface InstructorEarningDto {
  id: string;
  orderId: string;
  type: 'sale' | 'refund_adjustment';
  status: string;
  amountMinor: number;
  currency: 'EGP';
  createdAt: string;
  eligibleAt: string | null;
  payout: { id: string; status: string } | null;
}

export interface InstructorPayoutDto {
  id: string;
  status: string;
  currency: 'EGP';
  amountMinor: number;
  lineCount: number;
  periodStart: string;
  periodEnd: string;
  cutoffAt: string;
  createdAt: string;
  paidAt: string | null;
  cancelledAt: string | null;
  simulated: boolean;
}

export interface InstructorPayoutDetailDto extends InstructorPayoutDto {
  items: {
    earningEntryId: string;
    amountMinor: number;
    currency: 'EGP';
    type: string;
  }[];
}

export const instructorFinanceApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getInstructorFinanceSummary: builder.query<
      ApiSuccessEnvelope<{ summary: FinanceSummaryDto }>,
      { currency?: 'EGP' } | void
    >({
      query: (params) => ({
        url: '/instructor/finance/summary',
        params: { currency: params?.currency ?? 'EGP' },
      }),
      providesTags: ['Finance'],
    }),
    listInstructorSales: builder.query<
      ApiSuccessEnvelope<{
        sales: InstructorSaleDto[];
        pagination: { hasMore: boolean; nextCursor: string | null };
      }>,
      { cursor?: string; limit?: number } | void
    >({
      query: (params) => ({
        url: '/instructor/sales',
        params: {
          currency: 'EGP',
          limit: params?.limit ?? 20,
          ...(params?.cursor ? { cursor: params.cursor } : {}),
        },
      }),
      providesTags: ['Finance'],
    }),
    listInstructorEarnings: builder.query<
      ApiSuccessEnvelope<{
        earnings: InstructorEarningDto[];
        pagination: { hasMore: boolean; nextCursor: string | null };
      }>,
      { cursor?: string; limit?: number } | void
    >({
      query: (params) => ({
        url: '/instructor/earnings',
        params: {
          currency: 'EGP',
          limit: params?.limit ?? 20,
          ...(params?.cursor ? { cursor: params.cursor } : {}),
        },
      }),
      providesTags: ['Finance'],
    }),
    listInstructorPayouts: builder.query<
      ApiSuccessEnvelope<{
        payouts: InstructorPayoutDto[];
        pagination: { hasMore: boolean; nextCursor: string | null };
      }>,
      { cursor?: string; limit?: number } | void
    >({
      query: (params) => ({
        url: '/instructor/payouts',
        params: {
          currency: 'EGP',
          limit: params?.limit ?? 20,
          ...(params?.cursor ? { cursor: params.cursor } : {}),
        },
      }),
      providesTags: ['Payout'],
    }),
    getInstructorPayoutDetail: builder.query<
      ApiSuccessEnvelope<{ payout: InstructorPayoutDetailDto }>,
      string
    >({
      query: (payoutId) => `/instructor/payouts/${encodeURIComponent(payoutId)}`,
      providesTags: (_res, _err, id) => [{ type: 'Payout', id }],
    }),
  }),
});

export const {
  useGetInstructorFinanceSummaryQuery,
  useListInstructorSalesQuery,
  useListInstructorEarningsQuery,
  useListInstructorPayoutsQuery,
  useGetInstructorPayoutDetailQuery,
} = instructorFinanceApi;
