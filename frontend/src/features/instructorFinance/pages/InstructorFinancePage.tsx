import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  DollarOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import { Alert, Descriptions, Tabs } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import {
  DashboardButton,
  DashboardEmptyState,
  DashboardErrorState,
  DashboardModal,
  DashboardSkeleton,
  DataTable,
  MetricCard,
  StatusBadge,
} from '@/components/dashboard';
import {
  useGetInstructorFinanceSummaryQuery,
  useGetInstructorPayoutDetailQuery,
  useListInstructorEarningsQuery,
  useListInstructorPayoutsQuery,
  useListInstructorSalesQuery,
  type InstructorEarningDto,
  type InstructorPayoutDto,
  type InstructorSaleDto,
} from '@/features/instructorFinance/instructorFinanceApi';
import { parseApiError } from '@/lib/apiError';
import { formatEgpAmount } from '@/lib/formatters';

export default function InstructorFinancePage() {
  const [salesCursor, setSalesCursor] = useState<string | undefined>();
  const [earningsCursor, setEarningsCursor] = useState<string | undefined>();
  const [payoutsCursor, setPayoutsCursor] = useState<string | undefined>();
  const [selectedPayoutId, setSelectedPayoutId] = useState<string | null>(null);

  const summaryQuery = useGetInstructorFinanceSummaryQuery({ currency: 'EGP' });
  const salesQuery = useListInstructorSalesQuery({ cursor: salesCursor, limit: 20 });
  const earningsQuery = useListInstructorEarningsQuery({
    cursor: earningsCursor,
    limit: 20,
  });
  const payoutsQuery = useListInstructorPayoutsQuery({
    cursor: payoutsCursor,
    limit: 20,
  });
  const payoutDetailQuery = useGetInstructorPayoutDetailQuery(selectedPayoutId ?? '', {
    skip: !selectedPayoutId,
  });

  if (summaryQuery.isLoading) {
    return <DashboardSkeleton rows={6} />;
  }

  if (summaryQuery.isError || !summaryQuery.data?.data) {
    return (
      <DashboardErrorState
        message={
          parseApiError(summaryQuery.error, 'Unable to load instructor finance.').message
        }
        onRetry={() => summaryQuery.refetch()}
      />
    );
  }

  const summary = summaryQuery.data.data.summary;

  const salesColumns: ColumnsType<InstructorSaleDto> = [
    {
      title: 'Course',
      dataIndex: 'courseTitle',
      key: 'courseTitle',
      render: (val: string) => <span className="font-semibold text-ink">{val}</span>,
    },
    {
      title: 'Gross',
      dataIndex: 'amountMinor',
      key: 'amountMinor',
      render: (val: number) => formatEgpAmount(val),
    },
    {
      title: 'Platform Fee',
      dataIndex: 'platformCommissionMinor',
      key: 'platformCommissionMinor',
      render: (val: number) => (
        <span className="text-ink-muted">{formatEgpAmount(val)}</span>
      ),
    },
    {
      title: 'Your Share',
      dataIndex: 'instructorEarnedMinor',
      key: 'instructorEarnedMinor',
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
      title: 'Paid At',
      dataIndex: 'paidAt',
      key: 'paidAt',
      render: (val: string) => new Date(val).toLocaleDateString(),
    },
  ];

  const earningsColumns: ColumnsType<InstructorEarningDto> = [
    {
      title: 'Type',
      dataIndex: 'type',
      key: 'type',
      render: (val: string) => (
        <StatusBadge label={val.replace('_', ' ')} tone={val === 'sale' ? 'teal' : 'error'} />
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
      render: (val: string) => <StatusBadge label={val.replace(/_/g, ' ')} />,
    },
    {
      title: 'Eligible At',
      dataIndex: 'eligibleAt',
      key: 'eligibleAt',
      render: (val: string | null) =>
        val ? new Date(val).toLocaleDateString() : '—',
    },
    {
      title: 'Created',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (val: string) => new Date(val).toLocaleDateString(),
    },
  ];

  const payoutsColumns: ColumnsType<InstructorPayoutDto> = [
    {
      title: 'Payout ID',
      dataIndex: 'id',
      key: 'id',
      render: (id: string) => (
        <span className="font-mono text-[13px]">{id.slice(-8).toUpperCase()}</span>
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
      title: 'Lines',
      dataIndex: 'lineCount',
      key: 'lineCount',
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (val: string) => <StatusBadge label={val} />,
    },
    {
      title: 'Period',
      key: 'period',
      render: (_v, r) =>
        `${new Date(r.periodStart).toLocaleDateString()} – ${new Date(r.periodEnd).toLocaleDateString()}`,
    },
    {
      title: 'Action',
      key: 'action',
      render: (_v, r) => (
        <DashboardButton
          variant="link-action"
          onClick={() => setSelectedPayoutId(r.id)}
        >
          View Details
        </DashboardButton>
      ),
    },
  ];

  const payoutDetail = payoutDetailQuery.data?.data?.payout;

  return (
    <div className="space-y-xl">
      <div>
        <span className="text-[12px] font-bold uppercase tracking-[0.06em] text-primary">
          Revenue &amp; Settlements
        </span>
        <h1 className="text-[24px] font-bold text-ink mt-xxs">
          Instructor Finance
        </h1>
      </div>

      {summary.hasActiveHolds && (
        <Alert
          type="warning"
          showIcon
          title={`You have ${summary.activeHoldCount} active financial hold(s)`}
          description="Eligible payouts are temporarily held while open refund or payment disputes are resolved."
        />
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-md">
        <MetricCard
          label="Net Earned (30d)"
          value={formatEgpAmount(summary.instructorEarnedNetMinor)}
          icon={<DollarOutlined />}
          iconTone="teal"
        />
        <MetricCard
          label="Pending (In Refund Window)"
          value={formatEgpAmount(summary.pendingMinor)}
          icon={<ClockCircleOutlined />}
          iconTone="blue"
        />
        <MetricCard
          label="Eligible Available"
          value={formatEgpAmount(summary.eligibleAvailableMinor)}
          icon={<WalletOutlined />}
          iconTone="green"
        />
        <MetricCard
          label="Paid Settlements (30d)"
          value={formatEgpAmount(summary.paidPayoutsMinor)}
          icon={<CheckCircleOutlined />}
          iconTone="green"
        />
      </div>

      <Tabs
        items={[
          {
            key: 'sales',
            label: 'Sales',
            children: salesQuery.isLoading ? (
              <DashboardSkeleton rows={5} />
            ) : salesQuery.isError ? (
              <DashboardErrorState
                message={parseApiError(salesQuery.error).message}
                onRetry={() => salesQuery.refetch()}
              />
            ) : (salesQuery.data?.data?.sales ?? []).length === 0 ? (
              <DashboardEmptyState title="No sales recorded yet" />
            ) : (
              <div className="space-y-sm">
                <DataTable<InstructorSaleDto>
                  rowKey="id"
                  columns={salesColumns}
                  dataSource={salesQuery.data?.data?.sales ?? []}
                  pagination={false}
                />
                <div className="flex justify-end gap-xs">
                  {salesCursor && (
                    <DashboardButton
                      variant="secondary"
                      onClick={() => setSalesCursor(undefined)}
                    >
                      First Page
                    </DashboardButton>
                  )}
                  {salesQuery.data?.data?.pagination.hasMore &&
                    salesQuery.data.data.pagination.nextCursor && (
                      <DashboardButton
                        variant="primary"
                        onClick={() =>
                          setSalesCursor(
                            salesQuery.data?.data?.pagination.nextCursor ?? undefined,
                          )
                        }
                      >
                        Next Page
                      </DashboardButton>
                    )}
                </div>
              </div>
            ),
          },
          {
            key: 'earnings',
            label: 'Earnings Ledger',
            children: earningsQuery.isLoading ? (
              <DashboardSkeleton rows={5} />
            ) : earningsQuery.isError ? (
              <DashboardErrorState
                message={parseApiError(earningsQuery.error).message}
                onRetry={() => earningsQuery.refetch()}
              />
            ) : (earningsQuery.data?.data?.earnings ?? []).length === 0 ? (
              <DashboardEmptyState title="No earnings ledger entries yet" />
            ) : (
              <div className="space-y-sm">
                <DataTable<InstructorEarningDto>
                  rowKey="id"
                  columns={earningsColumns}
                  dataSource={earningsQuery.data?.data?.earnings ?? []}
                  pagination={false}
                />
                <div className="flex justify-end gap-xs">
                  {earningsCursor && (
                    <DashboardButton
                      variant="secondary"
                      onClick={() => setEarningsCursor(undefined)}
                    >
                      First Page
                    </DashboardButton>
                  )}
                  {earningsQuery.data?.data?.pagination.hasMore &&
                    earningsQuery.data.data.pagination.nextCursor && (
                      <DashboardButton
                        variant="primary"
                        onClick={() =>
                          setEarningsCursor(
                            earningsQuery.data?.data?.pagination.nextCursor ??
                              undefined,
                          )
                        }
                      >
                        Next Page
                      </DashboardButton>
                    )}
                </div>
              </div>
            ),
          },
          {
            key: 'payouts',
            label: 'Payout History',
            children: payoutsQuery.isLoading ? (
              <DashboardSkeleton rows={5} />
            ) : payoutsQuery.isError ? (
              <DashboardErrorState
                message={parseApiError(payoutsQuery.error).message}
                onRetry={() => payoutsQuery.refetch()}
              />
            ) : (payoutsQuery.data?.data?.payouts ?? []).length === 0 ? (
              <DashboardEmptyState title="No payouts yet" />
            ) : (
              <div className="space-y-sm">
                <DataTable<InstructorPayoutDto>
                  rowKey="id"
                  columns={payoutsColumns}
                  dataSource={payoutsQuery.data?.data?.payouts ?? []}
                  pagination={false}
                />
                <div className="flex justify-end gap-xs">
                  {payoutsCursor && (
                    <DashboardButton
                      variant="secondary"
                      onClick={() => setPayoutsCursor(undefined)}
                    >
                      First Page
                    </DashboardButton>
                  )}
                  {payoutsQuery.data?.data?.pagination.hasMore &&
                    payoutsQuery.data.data.pagination.nextCursor && (
                      <DashboardButton
                        variant="primary"
                        onClick={() =>
                          setPayoutsCursor(
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
            ),
          },
        ]}
      />

      <DashboardModal
        open={Boolean(selectedPayoutId)}
        onCancel={() => setSelectedPayoutId(null)}
        title="Payout Statement"
        width={640}
      >
        {payoutDetailQuery.isLoading || !payoutDetail ? (
          <DashboardSkeleton rows={4} />
        ) : (
          <div className="space-y-md pt-sm">
            <Descriptions column={2} bordered size="small">
              <Descriptions.Item label="Status">
                <StatusBadge label={payoutDetail.status} />
              </Descriptions.Item>
              <Descriptions.Item label="Total Amount">
                <span className="font-bold">
                  {formatEgpAmount(payoutDetail.amountMinor)}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="Lines">
                {payoutDetail.lineCount}
              </Descriptions.Item>
              <Descriptions.Item label="Paid At">
                {payoutDetail.paidAt
                  ? new Date(payoutDetail.paidAt).toLocaleString()
                  : '—'}
              </Descriptions.Item>
            </Descriptions>

            <div className="space-y-xs">
              <p className="text-[13px] font-semibold text-ink m-0">
                Included Ledger Items
              </p>
              {payoutDetail.items.map((item) => (
                <div
                  key={item.earningEntryId}
                  className="flex items-center justify-between text-[13px] rounded-md border border-border px-sm py-xs"
                >
                  <span className="font-mono text-[12px]">
                    {item.earningEntryId} ({item.type})
                  </span>
                  <span className="font-bold">
                    {formatEgpAmount(item.amountMinor)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </DashboardModal>
    </div>
  );
}
