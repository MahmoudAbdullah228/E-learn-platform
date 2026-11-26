import {
  CheckCircleOutlined,
  DollarOutlined,
  SafetyCertificateOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import { Alert, Card, Checkbox, Descriptions, Input, InputNumber, Select, Space, Tabs } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import {
  DashboardButton,
  DashboardEmptyState,
  DashboardErrorState,
  DashboardInput,
  DashboardModal,
  DashboardSkeleton,
  DataTable,
  MetricCard,
  StatusBadge,
  useDashboardNotify,
} from '@/components/dashboard';
import {
  useCancelAdminPayoutMutation,
  useCreateAdminPayoutDraftMutation,
  useGetAdminPayoutDetailQuery,
  useLazyPreviewInstructorSettlementQuery,
  useListAdminPayoutsQuery,
  useListAdminRefundsQuery,
  useMarkAdminPayoutPaidMutation,
  useReconcileAdminPayoutMutation,
  useRequestAdminOrderRefundMutation,
  useSubmitAdminPayoutMutation,
  type AdminPayoutDto,
  type AdminRefundDto,
  type PayoutPreviewDto,
  type PayoutStatus,
  type TransferMethod,
} from '@/features/adminFinance/payoutsAndRefundsApi';
import { useGetAdminFinanceSummaryQuery } from '@/features/adminUsers/adminUsersApi';
import { parseApiError } from '@/lib/apiError';
import { formatEgpAmount } from '@/lib/formatters';

function createIdempotencyKey(prefix: string): string {
  const raw =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
  return `${prefix}_${raw}`;
}

export default function AdminFinanceAndPayoutsPage() {
  const { message } = useDashboardNotify();

  // Platform & per-instructor finance summary lookup
  const [instructorLookupId, setInstructorLookupId] = useState('');
  const [appliedInstructorId, setAppliedInstructorId] = useState<string | undefined>();

  const financeSummaryQuery = useGetAdminFinanceSummaryQuery({
    currency: 'EGP',
    instructorId: appliedInstructorId,
  });

  // Payouts state
  const [payoutStatusFilter, setPayoutStatusFilter] = useState<PayoutStatus | 'all'>('all');
  const [payoutCursor, setPayoutCursor] = useState<string | undefined>();
  const [previewInstructorId, setPreviewInstructorId] = useState('');
  const [previewMonth, setPreviewMonth] = useState(() => {
    const d = new Date();
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  });
  const [previewCutoffIso, setPreviewCutoffIso] = useState(() => new Date().toISOString());
  const [previewData, setPreviewData] = useState<PayoutPreviewDto | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [selectedPayoutId, setSelectedPayoutId] = useState<string | null>(null);
  const [transferMethod, setTransferMethod] = useState<TransferMethod>('bank_transfer');
  const [transferAttemptId, setTransferAttemptId] = useState(() =>
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : '',
  );
  const [transferReference, setTransferReference] = useState('');
  const [confirmedAmountMinor, setConfirmedAmountMinor] = useState<number>(0);
  const [payoutActionReason, setPayoutActionReason] = useState('');
  const [reconcileOutcome, setReconcileOutcome] = useState<
    'confirmed_paid' | 'confirmed_not_sent' | 'unknown'
  >('confirmed_paid');
  const [payoutModalError, setPayoutModalError] = useState<string | null>(null);

  // Refunds state
  const [refundStatusFilter, setRefundStatusFilter] = useState<string>('all');
  const [refundOrderId, setRefundOrderId] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [refundOverride, setRefundOverride] = useState(false);
  const [refundFormError, setRefundFormError] = useState<string | null>(null);

  const payoutsQuery = useListAdminPayoutsQuery({
    status: payoutStatusFilter === 'all' ? undefined : payoutStatusFilter,
    cursor: payoutCursor,
    limit: 20,
  });
  const payoutDetailQuery = useGetAdminPayoutDetailQuery(selectedPayoutId ?? '', {
    skip: !selectedPayoutId,
  });
  const refundsQuery = useListAdminRefundsQuery({
    status: refundStatusFilter === 'all' ? undefined : refundStatusFilter,
    limit: 20,
  });

  const [triggerPreview, { isFetching: isPreviewing }] =
    useLazyPreviewInstructorSettlementQuery();
  const [createDraftPayout, { isLoading: isCreatingDraft }] =
    useCreateAdminPayoutDraftMutation();
  const [submitPayout, { isLoading: isSubmittingPayout }] =
    useSubmitAdminPayoutMutation();
  const [markPaid, { isLoading: isMarkingPaid }] = useMarkAdminPayoutPaidMutation();
  const [cancelPayout, { isLoading: isCancellingPayout }] =
    useCancelAdminPayoutMutation();
  const [reconcilePayout, { isLoading: isReconciling }] =
    useReconcileAdminPayoutMutation();
  const [requestRefund, { isLoading: isCreatingRefund }] =
    useRequestAdminOrderRefundMutation();

  const summary = financeSummaryQuery.data?.data?.summary;
  const activePayoutDetail = payoutDetailQuery.data?.data?.payout;

  const handlePreviewSettlement = async (e: React.FormEvent) => {
    e.preventDefault();
    setPreviewError(null);
    setPreviewData(null);
    if (!/^[a-f\d]{24}$/i.test(previewInstructorId.trim())) {
      setPreviewError('Please enter a valid 24-character Instructor ObjectId.');
      return;
    }
    try {
      const res = await triggerPreview({
        instructorId: previewInstructorId.trim(),
        month: previewMonth.trim(),
        cutoffAt: previewCutoffIso.trim(),
      }).unwrap();
      setPreviewData(res.data);
    } catch (err) {
      setPreviewError(parseApiError(err).message);
    }
  };

  const handleCreateDraftPayout = async () => {
    setPreviewError(null);
    try {
      const res = await createDraftPayout({
        instructorId: previewInstructorId.trim(),
        month: previewMonth.trim(),
        cutoffAt: previewCutoffIso.trim(),
        idempotencyKey: createIdempotencyKey('payout'),
      }).unwrap();
      void message.success('Draft payout reserved.');
      setSelectedPayoutId(res.data.payout.id);
      setConfirmedAmountMinor(res.data.payout.amountMinor);
    } catch (err) {
      setPreviewError(parseApiError(err).message);
    }
  };

  const handleSubmitPayout = async () => {
    if (!activePayoutDetail) return;
    setPayoutModalError(null);
    try {
      await submitPayout({
        payoutId: activePayoutDetail.id,
        expectedRevision: activePayoutDetail.revision,
        transferMethod,
      }).unwrap();
      void message.success('Payout sealed and submitted (pending confirmation).');
    } catch (err) {
      setPayoutModalError(parseApiError(err).message);
    }
  };

  const handleMarkPaid = async () => {
    if (!activePayoutDetail) return;
    setPayoutModalError(null);
    try {
      await markPaid({
        payoutId: activePayoutDetail.id,
        expectedRevision: activePayoutDetail.revision,
        transferAttemptId:
          activePayoutDetail.transferAttemptId ?? transferAttemptId.trim(),
        transferMethod: activePayoutDetail.transferMethod ?? transferMethod,
        confirmedAmountMinor:
          confirmedAmountMinor > 0
            ? confirmedAmountMinor
            : activePayoutDetail.amountMinor,
        transferReference: transferReference.trim().toUpperCase(),
      }).unwrap();
      void message.success('Payout marked Paid.');
      setTransferReference('');
    } catch (err) {
      setPayoutModalError(parseApiError(err).message);
    }
  };

  const handleCancelPayout = async () => {
    if (!activePayoutDetail) return;
    setPayoutModalError(null);
    const trimmedReason = payoutActionReason.trim();
    if (trimmedReason.length < 10) {
      setPayoutModalError('Cancellation reason must be at least 10 characters.');
      return;
    }
    try {
      await cancelPayout({
        payoutId: activePayoutDetail.id,
        expectedRevision: activePayoutDetail.revision,
        reason: trimmedReason,
        ...(activePayoutDetail.status === 'pending'
          ? {
              transferAttemptId:
                activePayoutDetail.transferAttemptId ?? transferAttemptId.trim(),
              transferMethod: activePayoutDetail.transferMethod ?? transferMethod,
              evidenceReference: transferReference.trim().toUpperCase(),
            }
          : {}),
      }).unwrap();
      void message.success('Payout cancelled.');
      setPayoutActionReason('');
    } catch (err) {
      setPayoutModalError(parseApiError(err).message);
    }
  };

  const handleReconcilePayout = async () => {
    if (!activePayoutDetail) return;
    setPayoutModalError(null);
    const trimmedReason = payoutActionReason.trim();
    if (trimmedReason.length < 10) {
      setPayoutModalError('Reconciliation reason must be at least 10 characters.');
      return;
    }
    try {
      await reconcilePayout({
        payoutId: activePayoutDetail.id,
        expectedRevision: activePayoutDetail.revision,
        outcome: reconcileOutcome,
        transferAttemptId:
          activePayoutDetail.transferAttemptId ?? transferAttemptId.trim(),
        transferMethod: activePayoutDetail.transferMethod ?? transferMethod,
        reason: trimmedReason,
        ...(reconcileOutcome === 'confirmed_paid'
          ? {
              confirmedAmountMinor:
                confirmedAmountMinor > 0
                  ? confirmedAmountMinor
                  : activePayoutDetail.amountMinor,
              transferReference: transferReference.trim().toUpperCase(),
            }
          : {
              evidenceReference: transferReference.trim().toUpperCase(),
            }),
      }).unwrap();
      void message.success('Payout reconciliation recorded.');
      setPayoutActionReason('');
    } catch (err) {
      setPayoutModalError(parseApiError(err).message);
    }
  };

  const handleInitiateRefund = async (e: React.FormEvent) => {
    e.preventDefault();
    setRefundFormError(null);
    if (!/^[a-f\d]{24}$/i.test(refundOrderId.trim())) {
      setRefundFormError('Please enter a valid 24-character Order ObjectId.');
      return;
    }
    if (refundReason.trim().length < 10 || refundReason.trim().length > 500) {
      setRefundFormError('Refund reason must be 10 to 500 characters.');
      return;
    }
    try {
      await requestRefund({
        orderId: refundOrderId.trim(),
        reason: refundReason.trim(),
        overrideWindow: refundOverride,
        idempotencyKey: createIdempotencyKey('refund'),
      }).unwrap();
      setRefundOrderId('');
      setRefundReason('');
      void message.success('Refund reservation accepted.');
    } catch (err) {
      setRefundFormError(parseApiError(err).message);
    }
  };

  const payoutColumns: ColumnsType<AdminPayoutDto> = [
    {
      title: 'Payout ID',
      dataIndex: 'id',
      key: 'id',
      render: (id: string) => (
        <span className="font-mono text-[13px]">{id.slice(-8).toUpperCase()}</span>
      ),
    },
    {
      title: 'Instructor ID',
      dataIndex: 'instructorId',
      key: 'instructorId',
      render: (id: string) => (
        <span className="font-mono text-[12px] text-ink-muted">{id}</span>
      ),
    },
    {
      title: 'Amount',
      dataIndex: 'amountMinor',
      key: 'amountMinor',
      render: (val: number) => (
        <span className="font-bold text-ink">{formatEgpAmount(val)}</span>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (val: string) => <StatusBadge label={val} />,
    },
    {
      title: 'Reference',
      dataIndex: 'transferReference',
      key: 'transferReference',
      render: (val: string | null) => val ?? '—',
    },
    {
      title: 'Action',
      key: 'action',
      render: (_v, record) => (
        <DashboardButton
          variant="link-action"
          onClick={() => {
            setSelectedPayoutId(record.id);
            setConfirmedAmountMinor(record.amountMinor);
            setPayoutModalError(null);
            if (!record.transferAttemptId && typeof crypto !== 'undefined') {
              setTransferAttemptId(crypto.randomUUID());
            }
          }}
        >
          Manage Lifecycle
        </DashboardButton>
      ),
    },
  ];

  const refundColumns: ColumnsType<AdminRefundDto> = [
    {
      title: 'Refund ID',
      dataIndex: 'id',
      key: 'id',
      render: (id: string) => (
        <span className="font-mono text-[12px]">{id.slice(-8).toUpperCase()}</span>
      ),
    },
    {
      title: 'Order ID',
      dataIndex: 'orderId',
      key: 'orderId',
      render: (id: string) => <span className="font-mono text-[12px]">{id}</span>,
    },
    {
      title: 'Amount',
      dataIndex: 'amountMinor',
      key: 'amountMinor',
      render: (val: number) => (
        <span className="font-bold text-ink">{formatEgpAmount(val)}</span>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (val: string) => <StatusBadge label={val.replace(/_/g, ' ')} />,
    },
    {
      title: 'Created',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (val: string) => new Date(val).toLocaleString(),
    },
  ];

  return (
    <div className="space-y-xl">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-md">
        <div>
          <span className="text-[12px] font-bold uppercase tracking-[0.06em] text-primary">
            Platform &amp; Instructor Settlements
          </span>
          <h1 className="text-[24px] font-bold text-ink mt-xxs">
            Admin Finance, Payouts &amp; Refunds
          </h1>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            const trimmed = instructorLookupId.trim();
            setAppliedInstructorId(trimmed || undefined);
          }}
          className="flex gap-xs"
        >
          <Input
            placeholder="Filter by Instructor ID (optional)"
            value={instructorLookupId}
            onChange={(e) => setInstructorLookupId(e.target.value)}
            style={{ width: 260 }}
          />
          <DashboardButton htmlType="submit" variant="secondary">
            Filter
          </DashboardButton>
        </form>
      </div>

      {financeSummaryQuery.isLoading ? (
        <DashboardSkeleton rows={3} />
      ) : financeSummaryQuery.isError ? (
        <DashboardErrorState
          message={parseApiError(financeSummaryQuery.error).message}
          onRetry={() => financeSummaryQuery.refetch()}
        />
      ) : summary ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-md">
          <MetricCard
            label={appliedInstructorId ? 'Instructor Net Sales' : 'Platform Net Sales'}
            value={formatEgpAmount(summary.netSalesMinor)}
            icon={<DollarOutlined />}
            iconTone="teal"
          />
          <MetricCard
            label="Platform Commission Net"
            value={formatEgpAmount(summary.platformCommissionNetMinor)}
            icon={<SafetyCertificateOutlined />}
            iconTone="blue"
          />
          <MetricCard
            label="Eligible Unpaid Earnings"
            value={formatEgpAmount(summary.eligibleAvailableMinor)}
            icon={<WalletOutlined />}
            iconTone="green"
          />
          <MetricCard
            label="Paid Payouts (30d)"
            value={formatEgpAmount(summary.paidPayoutsMinor)}
            icon={<CheckCircleOutlined />}
            iconTone="green"
          />
        </div>
      ) : null}

      <Tabs
        items={[
          {
            key: 'payouts',
            label: 'Payouts & Settlement Lifecycle',
            children: (
              <div className="space-y-lg">
                {/* Settlement Preview & Draft Creation */}
                <Card className="rounded-lg shadow-card border-hairline space-y-md">
                  <h2 className="text-[18px] font-semibold text-ink m-0">
                    Preview &amp; Reserve Settlement Draft
                  </h2>
                  {previewError && (
                    <Alert type="error" showIcon title={previewError} />
                  )}
                  <form
                    onSubmit={handlePreviewSettlement}
                    className="grid grid-cols-1 md:grid-cols-4 gap-sm items-end"
                  >
                    <DashboardInput
                      label="Instructor ID"
                      placeholder="24-char ObjectId"
                      value={previewInstructorId}
                      onChange={(e) => setPreviewInstructorId(e.target.value)}
                    />
                    <DashboardInput
                      label="Month (YYYY-MM)"
                      value={previewMonth}
                      onChange={(e) => setPreviewMonth(e.target.value)}
                    />
                    <DashboardInput
                      label="Cutoff (ISO UTC)"
                      value={previewCutoffIso}
                      onChange={(e) => setPreviewCutoffIso(e.target.value)}
                    />
                    <DashboardButton
                      htmlType="submit"
                      variant="outline"
                      loading={isPreviewing}
                    >
                      Preview Settlement
                    </DashboardButton>
                  </form>

                  {previewData && (
                    <div className="rounded-md bg-surface-subtle border border-border p-md space-y-sm">
                      <Descriptions column={{ xs: 1, sm: 3 }} size="small">
                        <Descriptions.Item label="Eligible Sales">
                          {formatEgpAmount(previewData.eligibleSalesMinor)}
                        </Descriptions.Item>
                        <Descriptions.Item label="Negative Carry">
                          {formatEgpAmount(previewData.negativeCarryMinor)}
                        </Descriptions.Item>
                        <Descriptions.Item label="Net Eligible">
                          <span className="font-bold">
                            {formatEgpAmount(previewData.netEligibleMinor)}
                          </span>
                        </Descriptions.Item>
                      </Descriptions>

                      {previewData.blocked && (
                        <Alert
                          type="warning"
                          showIcon
                          title={`Blocked: ${previewData.reasonCodes.join(', ')}`}
                        />
                      )}

                      <DashboardButton
                        variant="primary"
                        loading={isCreatingDraft}
                        disabled={
                          previewData.blocked || previewData.netEligibleMinor <= 0
                        }
                        onClick={handleCreateDraftPayout}
                      >
                        Create Draft Payout
                      </DashboardButton>
                    </div>
                  )}
                </Card>

                {/* Payouts list */}
                {payoutsQuery.isLoading ? (
                  <DashboardSkeleton rows={5} />
                ) : payoutsQuery.isError ? (
                  <DashboardErrorState
                    message={parseApiError(payoutsQuery.error).message}
                    onRetry={() => payoutsQuery.refetch()}
                  />
                ) : (
                  <div className="space-y-sm">
                    <DataTable<AdminPayoutDto>
                      rowKey="id"
                      columns={payoutColumns}
                      dataSource={payoutsQuery.data?.data?.payouts ?? []}
                      locale={{
                        emptyText: <DashboardEmptyState title="No payouts found" />,
                      }}
                      toolbarRight={
                        <Select
                          value={payoutStatusFilter}
                          onChange={(val) => {
                            setPayoutStatusFilter(val);
                            setPayoutCursor(undefined);
                          }}
                          style={{ width: 160 }}
                          options={[
                            { label: 'All Statuses', value: 'all' },
                            { label: 'Draft', value: 'draft' },
                            { label: 'Pending', value: 'pending' },
                            { label: 'Paid', value: 'paid' },
                            { label: 'Cancelled', value: 'cancelled' },
                          ]}
                        />
                      }
                      pagination={false}
                    />

                    <div className="flex justify-end gap-xs">
                      {payoutCursor && (
                        <DashboardButton
                          variant="secondary"
                          onClick={() => setPayoutCursor(undefined)}
                        >
                          First Page
                        </DashboardButton>
                      )}
                      {payoutsQuery.data?.data?.pagination.hasMore &&
                        payoutsQuery.data.data.pagination.nextCursor && (
                          <DashboardButton
                            variant="primary"
                            onClick={() =>
                              setPayoutCursor(
                                payoutsQuery.data?.data?.pagination.nextCursor ??
                                  undefined,
                              )
                            }
                          >
                            Next Page
                          </DashboardButton>
                        )}
                    </div>
                  </div>
                )}
              </div>
            ),
          },
          {
            key: 'refunds',
            label: 'Refunds',
            children: (
              <div className="space-y-lg">
                <Card className="rounded-lg shadow-card border-hairline space-y-md">
                  <h2 className="text-[18px] font-semibold text-ink m-0">
                    Initiate Administrative Order Refund
                  </h2>
                  {refundFormError && (
                    <Alert type="error" showIcon title={refundFormError} />
                  )}
                  <form onSubmit={handleInitiateRefund} className="space-y-md">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
                      <DashboardInput
                        label="Order ID"
                        placeholder="24-char Order ObjectId"
                        value={refundOrderId}
                        onChange={(e) => setRefundOrderId(e.target.value)}
                      />
                      <div className="flex items-end pb-xs">
                        <Checkbox
                          checked={refundOverride}
                          onChange={(e) => setRefundOverride(e.target.checked)}
                        >
                          Override 14-day refund window
                        </Checkbox>
                      </div>
                    </div>
                    <Input.TextArea
                      rows={2}
                      placeholder="Administrative refund reason (10–500 characters)..."
                      value={refundReason}
                      onChange={(e) => setRefundReason(e.target.value)}
                    />
                    <DashboardButton
                      htmlType="submit"
                      variant="primary"
                      loading={isCreatingRefund}
                    >
                      Reserve &amp; Issue Refund
                    </DashboardButton>
                  </form>
                </Card>

                {refundsQuery.isLoading ? (
                  <DashboardSkeleton rows={5} />
                ) : refundsQuery.isError ? (
                  <DashboardErrorState
                    message={parseApiError(refundsQuery.error).message}
                    onRetry={() => refundsQuery.refetch()}
                  />
                ) : (
                  <DataTable<AdminRefundDto>
                    rowKey="id"
                    columns={refundColumns}
                    dataSource={refundsQuery.data?.data?.refunds ?? []}
                    locale={{
                      emptyText: <DashboardEmptyState title="No refunds recorded" />,
                    }}
                    toolbarRight={
                      <Select
                        value={refundStatusFilter}
                        onChange={setRefundStatusFilter}
                        style={{ width: 200 }}
                        options={[
                          { label: 'All Refund Statuses', value: 'all' },
                          { label: 'Requested', value: 'requested' },
                          { label: 'Processing', value: 'processing' },
                          { label: 'Pending', value: 'pending' },
                          { label: 'Requires Reconciliation', value: 'requires_reconciliation' },
                          { label: 'Succeeded', value: 'succeeded' },
                          { label: 'Failed', value: 'failed' },
                          { label: 'Cancelled', value: 'cancelled' },
                        ]}
                      />
                    }
                    pagination={false}
                  />
                )}
              </div>
            ),
          },
        ]}
      />

      {/* Payout Lifecycle Modal */}
      <DashboardModal
        open={Boolean(selectedPayoutId)}
        onCancel={() => setSelectedPayoutId(null)}
        title="Payout Settlement Lifecycle"
        width={680}
      >
        {payoutDetailQuery.isLoading || !activePayoutDetail ? (
          <DashboardSkeleton rows={5} />
        ) : (
          <div className="space-y-md pt-sm">
            {payoutModalError && (
              <Alert type="error" showIcon title={payoutModalError} />
            )}

            <Descriptions column={2} bordered size="small">
              <Descriptions.Item label="Status">
                <StatusBadge label={activePayoutDetail.status} />
              </Descriptions.Item>
              <Descriptions.Item label="Amount">
                <span className="font-bold">
                  {formatEgpAmount(activePayoutDetail.amountMinor)}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="Revision">
                {activePayoutDetail.revision}
              </Descriptions.Item>
              <Descriptions.Item label="Transfer Outcome">
                {activePayoutDetail.transferOutcome ?? '—'}
              </Descriptions.Item>
              <Descriptions.Item label="Transfer Reference" span={2}>
                {activePayoutDetail.transferReference ?? '—'}
              </Descriptions.Item>
            </Descriptions>

            {(activePayoutDetail.status === 'draft' ||
              activePayoutDetail.status === 'pending') && (
              <div className="space-y-md pt-sm border-t border-hairline">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-sm">
                  <div className="space-y-xxs">
                    <label className="block text-[13px] font-semibold text-ink">
                      Transfer Method
                    </label>
                    <Select
                      className="w-full"
                      value={activePayoutDetail.transferMethod ?? transferMethod}
                      disabled={Boolean(activePayoutDetail.transferMethod)}
                      onChange={setTransferMethod}
                      options={[
                        { label: 'Bank Transfer', value: 'bank_transfer' },
                        { label: 'Manual Transfer', value: 'manual_transfer' },
                        { label: 'Test Simulation', value: 'test_simulation' },
                      ]}
                    />
                  </div>
                  <DashboardInput
                    label="Transfer Reference (3–128 chars)"
                    placeholder="e.g. TXN-2026-0001"
                    value={transferReference}
                    onChange={(e) => setTransferReference(e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-sm">
                  <DashboardInput
                    label="Transfer Attempt UUID v4"
                    value={activePayoutDetail.transferAttemptId ?? transferAttemptId}
                    disabled={Boolean(activePayoutDetail.transferAttemptId)}
                    onChange={(e) => setTransferAttemptId(e.target.value)}
                  />
                  <div className="space-y-xxs">
                    <label className="block text-[13px] font-semibold text-ink">
                      Confirmed Amount (Minor EGP)
                    </label>
                    <InputNumber
                      className="w-full"
                      min={1}
                      value={confirmedAmountMinor}
                      onChange={(val) =>
                        setConfirmedAmountMinor(typeof val === 'number' ? val : 0)
                      }
                    />
                  </div>
                </div>

                <Input.TextArea
                  rows={2}
                  placeholder="Reason (10–500 chars, required for Cancel or Reconcile)"
                  value={payoutActionReason}
                  onChange={(e) => setPayoutActionReason(e.target.value)}
                />

                <Space wrap>
                  {activePayoutDetail.status === 'draft' && (
                    <DashboardButton
                      variant="primary"
                      loading={isSubmittingPayout}
                      onClick={handleSubmitPayout}
                    >
                      Submit &amp; Seal Payout
                    </DashboardButton>
                  )}

                  {activePayoutDetail.status === 'pending' && (
                    <>
                      <DashboardButton
                        variant="primary"
                        loading={isMarkingPaid}
                        onClick={handleMarkPaid}
                      >
                        Confirm Mark Paid
                      </DashboardButton>
                      <Select
                        value={reconcileOutcome}
                        onChange={setReconcileOutcome}
                        style={{ width: 190 }}
                        options={[
                          { label: 'Reconcile: Paid', value: 'confirmed_paid' },
                          { label: 'Reconcile: Not Sent', value: 'confirmed_not_sent' },
                          { label: 'Reconcile: Unknown', value: 'unknown' },
                        ]}
                      />
                      <DashboardButton
                        variant="outline"
                        loading={isReconciling}
                        onClick={handleReconcilePayout}
                      >
                        Reconcile
                      </DashboardButton>
                    </>
                  )}

                  <DashboardButton
                    variant="secondary"
                    loading={isCancellingPayout}
                    onClick={handleCancelPayout}
                  >
                    Cancel Payout
                  </DashboardButton>
                </Space>
              </div>
            )}
          </div>
        )}
      </DashboardModal>
    </div>
  );
}
