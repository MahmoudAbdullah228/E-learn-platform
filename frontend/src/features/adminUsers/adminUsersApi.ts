import { baseApi } from '@/app/baseApi';
import type { AccountStatus, ApiSuccessEnvelope, UserRole } from '@/types/api';

export interface AdminUserDto {
  id: string;
  name: string;
  email: string;
  roles: UserRole[];
  status: AccountStatus;
  instructorStatus: string;
  revision: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface FinanceSummaryDto {
  currency: 'EGP';
  range: { from: string; to: string };
  asOf: string;
  saleCount: number;
  successfulRefundCount: number;
  paidPayoutCount: number;
  activeHoldCount: number;
  hasActiveHolds: boolean;
  grossSalesMinor: number;
  successfulRefundsMinor: number;
  netSalesMinor: number;
  platformCommissionNetMinor: number;
  instructorEarnedNetMinor: number;
  pendingMinor: number;
  pendingSalesMinor: number;
  pendingAdjustmentsMinor: number;
  eligibleAvailableMinor: number;
  negativeCarryMinor: number;
  reservedMinor: number;
  paidPayoutsMinor: number;
  simulatedPaidPayoutsMinor: number;
}

export interface AdminDashboardDto {
  users: {
    total: number;
    active: number;
    suspended: number;
    students: number;
    activeInstructors: number;
    pendingApplications: number;
  };
  courses: {
    total: number;
    draft: number;
    pendingReview: number;
    published: number;
    rejected: number;
    unavailable: number;
    archived: number;
  };
  finance: FinanceSummaryDto;
}

export const adminUsersAndFinanceApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    listAdminUsers: builder.query<
      ApiSuccessEnvelope<{
        users: AdminUserDto[];
        pagination: { hasMore: boolean; nextCursor: string | null };
      }>,
      {
        q?: string;
        role?: UserRole;
        status?: AccountStatus;
        cursor?: string;
        limit?: number;
      } | void
    >({
      query: (params) => {
        const queryParams: Record<string, string | number> = {
          limit: params?.limit ?? 20,
        };
        if (params?.q?.trim()) queryParams.q = params.q.trim();
        if (params?.role) queryParams.role = params.role;
        if (params?.status) queryParams.status = params.status;
        if (params?.cursor) queryParams.cursor = params.cursor;
        return {
          url: '/admin/users',
          params: queryParams,
        };
      },
      providesTags: ['AdminUser'],
    }),
    changeAdminUserStatus: builder.mutation<
      ApiSuccessEnvelope<{ user: AdminUserDto; changed: boolean }>,
      {
        userId: string;
        status: AccountStatus;
        reason: string;
        expectedRevision: number;
      }
    >({
      query: ({ userId, status, reason, expectedRevision }) => ({
        url: `/admin/users/${encodeURIComponent(userId)}/status`,
        method: 'PATCH',
        body: { status, reason, expectedRevision },
      }),
      invalidatesTags: ['AdminUser', 'Finance'],
    }),
    getAdminDashboard: builder.query<
      ApiSuccessEnvelope<AdminDashboardDto>,
      { currency?: 'EGP'; from?: string; to?: string } | void
    >({
      query: (params) => ({
        url: '/admin/dashboard',
        params: params
          ? {
              currency: params.currency ?? 'EGP',
              ...(params.from ? { from: params.from } : {}),
              ...(params.to ? { to: params.to } : {}),
            }
          : { currency: 'EGP' },
      }),
      providesTags: ['Finance'],
    }),
    getAdminFinanceSummary: builder.query<
      ApiSuccessEnvelope<{ instructorId: string | null; summary: FinanceSummaryDto }>,
      { currency?: 'EGP'; instructorId?: string; from?: string; to?: string } | void
    >({
      query: (params) => ({
        url: '/admin/finance/summary',
        params: {
          currency: params?.currency ?? 'EGP',
          ...(params?.instructorId ? { instructorId: params.instructorId } : {}),
          ...(params?.from ? { from: params.from } : {}),
          ...(params?.to ? { to: params.to } : {}),
        },
      }),
      providesTags: ['Finance'],
    }),
  }),
});

export const {
  useListAdminUsersQuery,
  useChangeAdminUserStatusMutation,
  useGetAdminDashboardQuery,
  useGetAdminFinanceSummaryQuery,
} = adminUsersAndFinanceApi;
