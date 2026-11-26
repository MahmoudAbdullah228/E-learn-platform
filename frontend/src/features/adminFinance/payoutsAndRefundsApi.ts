import { baseApi } from '@/app/baseApi';
import type { ApiSuccessEnvelope } from '@/types/api';

export type PayoutStatus = 'draft' | 'pending' | 'paid' | 'cancelled';
export type TransferMethod = 'bank_transfer' | 'manual_transfer' | 'test_simulation';

export interface PayoutPreviewDto {
  instructorId: string;
  currency: 'EGP';
  eligibleSalesMinor: number;
  negativeCarryMinor: number;
  netEligibleMinor: number;
  lineCount: number;
  blocked: boolean;
  reasonCodes: string[];
  periodStart: string;
  periodEnd: string;
  cutoffAt: string;
}

export interface AdminPayoutDto {
  id: string;
  instructorId: string;
  currency: 'EGP';
  amountMinor: number;
  lineCount: number;
  periodStart: string;
  periodEnd: string;
  cutoffAt: string;
  createdAt: string;
  revision: number;
  status: PayoutStatus;
  hasActiveHolds?: boolean;
  sealedAt?: string | null;
  sealedBy?: string | null;
  transferAttemptId?: string | null;
  transferMethod?: TransferMethod | null;
  transferOutcome?: string;
  transferReference?: string | null;
  paidAt?: string | null;
  cancelledAt?: string | null;
}

export interface AdminPayoutDetailDto extends AdminPayoutDto {
  items: {
    earningEntryId: string;
    amountMinor: number;
    currency: 'EGP';
    type: string;
  }[];
}

export interface AdminRefundDto {
  id: string;
  orderId: string;
  amountMinor: number;
  currency: 'EGP';
  status: string;
  createdAt: string;
  completedAt: string | null;
  updatedAt?: string;
  failureCode?: string | null;
}

export const payoutsAndRefundsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    previewInstructorSettlement: builder.query<
      ApiSuccessEnvelope<PayoutPreviewDto>,
      { instructorId: string; month: string; cutoffAt: string }
    >({
      query: ({ instructorId, month, cutoffAt }) => ({
        url: `/admin/instructors/${encodeURIComponent(instructorId)}/settlement-preview`,
        params: { month, cutoffAt },
      }),
    }),
    listAdminPayouts: builder.query<
      ApiSuccessEnvelope<{
        payouts: AdminPayoutDto[];
        pagination: { hasMore: boolean; nextCursor: string | null };
      }>,
      { instructorId?: string; status?: PayoutStatus; cursor?: string; limit?: number } | void
    >({
      query: (params) => ({
        url: '/admin/payouts',
        params: {
          limit: params?.limit ?? 20,
          ...(params?.instructorId ? { instructorId: params.instructorId } : {}),
          ...(params?.status ? { status: params.status } : {}),
          ...(params?.cursor ? { cursor: params.cursor } : {}),
        },
      }),
      providesTags: ['Payout'],
    }),
    getAdminPayoutDetail: builder.query<
      ApiSuccessEnvelope<{ payout: AdminPayoutDetailDto }>,
      string
    >({
      query: (payoutId) => `/admin/payouts/${encodeURIComponent(payoutId)}`,
      providesTags: (_res, _err, id) => [{ type: 'Payout', id }],
    }),
    createAdminPayoutDraft: builder.mutation<
      ApiSuccessEnvelope<{ payout: AdminPayoutDto; replayed: boolean }>,
      {
        instructorId: string;
        month: string;
        cutoffAt: string;
        idempotencyKey: string;
      }
    >({
      query: ({ idempotencyKey, ...body }) => ({
        url: '/admin/payouts',
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body,
      }),
      invalidatesTags: ['Payout', 'Finance'],
    }),
    submitAdminPayout: builder.mutation<
      ApiSuccessEnvelope<{ payout: AdminPayoutDto }>,
      { payoutId: string; expectedRevision: number; transferMethod: TransferMethod }
    >({
      query: ({ payoutId, ...body }) => ({
        url: `/admin/payouts/${encodeURIComponent(payoutId)}/submit`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_res, _err, { payoutId }) => [
        'Payout',
        { type: 'Payout', id: payoutId },
        'Finance',
      ],
    }),
    markAdminPayoutPaid: builder.mutation<
      ApiSuccessEnvelope<{ payout: AdminPayoutDto }>,
      {
        payoutId: string;
        expectedRevision: number;
        transferAttemptId: string;
        transferMethod: TransferMethod;
        confirmedAmountMinor: number;
        transferReference: string;
      }
    >({
      query: ({ payoutId, ...body }) => ({
        url: `/admin/payouts/${encodeURIComponent(payoutId)}/mark-paid`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_res, _err, { payoutId }) => [
        'Payout',
        { type: 'Payout', id: payoutId },
        'Finance',
      ],
    }),
    cancelAdminPayout: builder.mutation<
      ApiSuccessEnvelope<{ payout: AdminPayoutDto }>,
      {
        payoutId: string;
        expectedRevision: number;
        reason: string;
        transferAttemptId?: string;
        transferMethod?: TransferMethod;
        evidenceReference?: string;
      }
    >({
      query: ({ payoutId, ...body }) => ({
        url: `/admin/payouts/${encodeURIComponent(payoutId)}/cancel`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_res, _err, { payoutId }) => [
        'Payout',
        { type: 'Payout', id: payoutId },
        'Finance',
      ],
    }),
    reconcileAdminPayout: builder.mutation<
      ApiSuccessEnvelope<{ payout: AdminPayoutDto }>,
      {
        payoutId: string;
        expectedRevision: number;
        outcome: 'confirmed_paid' | 'confirmed_not_sent' | 'unknown';
        transferAttemptId: string;
        transferMethod: TransferMethod;
        reason: string;
        confirmedAmountMinor?: number;
        transferReference?: string;
        evidenceReference?: string;
      }
    >({
      query: ({ payoutId, ...body }) => ({
        url: `/admin/payouts/${encodeURIComponent(payoutId)}/reconcile`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_res, _err, { payoutId }) => [
        'Payout',
        { type: 'Payout', id: payoutId },
        'Finance',
      ],
    }),
    listAdminRefunds: builder.query<
      ApiSuccessEnvelope<{
        refunds: AdminRefundDto[];
        pagination: { hasMore: boolean; nextCursor: string | null };
      }>,
      { status?: string; orderId?: string; cursor?: string; limit?: number } | void
    >({
      query: (params) => ({
        url: '/admin/refunds',
        params: {
          limit: params?.limit ?? 20,
          ...(params?.status ? { status: params.status } : {}),
          ...(params?.orderId ? { orderId: params.orderId } : {}),
          ...(params?.cursor ? { cursor: params.cursor } : {}),
        },
      }),
      providesTags: ['Refund'],
    }),
    requestAdminOrderRefund: builder.mutation<
      ApiSuccessEnvelope<{ refund: AdminRefundDto }>,
      {
        orderId: string;
        reason: string;
        overrideWindow: boolean;
        idempotencyKey: string;
      }
    >({
      query: ({ orderId, idempotencyKey, ...body }) => ({
        url: `/admin/orders/${encodeURIComponent(orderId)}/refunds`,
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body,
      }),
      invalidatesTags: ['Refund', 'Order', 'Finance'],
    }),
  }),
});

export const {
  useLazyPreviewInstructorSettlementQuery,
  useListAdminPayoutsQuery,
  useGetAdminPayoutDetailQuery,
  useCreateAdminPayoutDraftMutation,
  useSubmitAdminPayoutMutation,
  useMarkAdminPayoutPaidMutation,
  useCancelAdminPayoutMutation,
  useReconcileAdminPayoutMutation,
  useListAdminRefundsQuery,
  useRequestAdminOrderRefundMutation,
} = payoutsAndRefundsApi;
