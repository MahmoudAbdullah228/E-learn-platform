# S3-11 — Instructor finance

Use a current instructor bearer token. The backend takes the instructor identity from
the authenticated session. Each response uses `Cache-Control: no-store` and a single
MongoDB snapshot. A missing or foreign payout ID returns the same `404`.

| GET route under `/api/v1/instructor` | Date used for filtering | Optional list filters |
| --- | --- | --- |
| `/finance/summary` | Activity dates below | `currency=EGP` |
| `/sales` | `Order.paidAt` | `status=paid\|refunded`, `courseId` |
| `/earnings` | `EarningEntry.createdAt` | `status=pending\|eligible\|included_in_payout\|reversed`, `type=sale\|refund_adjustment` |
| `/payouts` | `Payout.createdAt` | `status=draft\|pending\|paid\|cancelled` |
| `/payouts/{payoutId}` | Current payout and its immutable signed items | None |

Pass both `from` (inclusive) and `to` (exclusive) as UTC timestamps ending in `Z`.
The range can span up to 366 days and end at or before `asOf`. Summary defaults to the
previous 30 elapsed days. Lists default to all available history through `asOf`.
Lists order newest first and use `_id` descending to break timestamp ties. Send the
returned `pagination.nextCursor` with the same filters. Cursors are scoped to the
instructor and list. Each page reads current data, so a record whose status changes
may enter or leave a filtered list between requests. `limit` defaults to 20 and caps at 100.

## Summary definitions

All amounts are signed EGP minor units. Decimal aggregation preserves every integer
unit and returns `409 FINANCE_REPORT_REQUIRES_REVIEW` if a result cannot be represented
as a safe JSON integer.

| Metric | Definition |
| --- | --- |
| `saleCount`, `grossSalesMinor` | Count and original amount of recorded paid or refunded orders in the range, by `paidAt`. The trusted provider confirmation date is shown separately when available. |
| `successfulRefundCount`, `successfulRefundsMinor` | Confirmed full refunds accounted in the range, by `completedAt`, including refunds for earlier sales. Partial refunds awaiting reconciliation remain outside these totals. |
| `netSalesMinor` | Gross sales less successful refunds in the range. Can be negative. |
| `platformCommissionNetMinor`, `instructorEarnedNetMinor` | Frozen order splits for the range’s sales, less those same splits for the range’s confirmed refunds. A reversed sale and a refund adjustment do not count as separate deductions. Gateway fees are outside these totals. |
| `pendingSalesMinor`, `pendingAdjustmentsMinor`, `pendingMinor` | All current pending sales, signed pending refund adjustments, and their sum. Pending adjustments include unresolved transfer dependencies. |
| `eligibleAvailableMinor`, `negativeCarryMinor` | All current unreserved eligible earnings including signed debt, and the negative adjustment component on its own. Holds may block settlement even with a positive balance. |
| `reservedMinor` | Current draft and pending payout amounts. |
| `paidPayoutCount`, `paidPayoutsMinor` | Recorded paid payout count and amount by `paidAt` in the range. Contains the simulated subset, reported separately as `simulatedPaidPayoutsMinor`. |
| `activeHoldCount`, `hasActiveHolds` | Current unresolved holds belonging to that instructor. |

Sales show the current confirmed full refund summary when available. The earnings list
shows reversed rows and payout state for included rows. Cancelled payouts keep their
original statements and do not count as reserved or paid. The settlement DTO exposes
`simulated` so the frontend can label Test Mode settlements. Student identity, provider
references, transfer evidence and operator details are excluded from instructor views.

The report reads existing orders, refunds, earning entries, payouts, items and holds.
The supporting indexes cover sales by owner/currency/payment date, confirmed refunds
by owner/currency/completion date, earnings by owner/currency/creation date, and payout
activity by owner/status/payment date. No reporting copies or new collections are required.
Local `explain('queryPlanner')` chose index scans for sales, earnings, refund activity,
payout history and paid payout totals. The default list plans had no blocking sort.

`npm run verify` passed locally with 643 tests, lint and OpenAPI validation. Staging
acceptance for B13 remains open.
