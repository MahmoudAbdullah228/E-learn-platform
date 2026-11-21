# S3-12 — Administrator finance

Use a current admin bearer token with `/api/v1`. The endpoints use private rate
limits, `Cache-Control: no-store` and one MongoDB snapshot per request.

| GET endpoint | Scope and response |
| --- | --- |
| `/admin/dashboard` | `data.users`, `data.courses` and marketplace `data.finance`. |
| `/admin/finance/summary` | `data.summary` for all accounts by default. Pass `instructorId` for one existing account, including suspended and former instructors. `data.instructorId` is `null` for marketplace scope. |
| `/admin/orders/{orderId}` | Existing financial snapshot plus Stripe references on `data.payment`, a page of `data.refunds` and `data.refundPagination`. |

`/dashboard` and `/finance/summary` accept `currency=EGP` and both UTC bounds (`from`
inclusive, `to` exclusive), up to 366 days. The default period is the last 30 days.
The response echoes the resolved range and `asOf` under `finance` or `summary`.
User and course counts and financial balances reflect current records. Counts
include all student-role accounts, active instructor-role accounts and pending
application records. A multi-role user counts once in each applicable role metric.
Course counts cover every course status, including archived and unavailable courses.

Amounts use the shared [finance definitions](sprint_3_instructor_finance.md).
The report counts recorded paid orders (including orders later refunded) by `paidAt`,
confirmed full refunds by `completedAt` and paid payouts by `paidAt`. Free enrollment
does not create a sale. Pending or failed refunds stay out of successful refund totals.
Sales and refund activity are aggregated separately before computing net amounts.
Platform commission and instructor earnings use the original order split. Current
pending, eligible, reserved and negative carry balances, and unresolved holds, are
reported independently of the selected range. Marketplace balances sum accounts for
reporting purposes. Settlement authorization still uses an individual instructor's
balance and holds. Simulated paid payouts are included and shown separately.

Admin order detail returns nullable `paymentIntentId`, `checkoutSessionId` and
`paymentConfirmedAt` on the payment object. Refund history includes the refund state,
amount, currency and dates plus a nullable `providerRefundId`. Only identifier-shaped
values are shown. Student order responses and the admin order list keep their existing
shape. Customer emails, client secrets, provider payloads, internal refund notes,
idempotency keys and worker leases are excluded from the detail addition.

Refund history sorts newest first with `_id` as the tie-breaker. `refundLimit` defaults
to 20 and can be at most 100. Pass `data.refundPagination.nextCursor` as `refundCursor`
to continue on the same order with the same administrator. `order.latestRefund` still
shows the latest refund regardless of which history page is requested.

Global sales, refund and paid payout activity use date indexes that include only the
relevant statuses. Current open hold counts use a partial index. Order history uses
the existing refund index on `orderId`, `createdAt` and `_id`.
The local query planner used an index scan for each dated activity query, a count
scan for open holds and the existing index for the default refund page without a
blocking sort.

`npm run verify` passed locally with 646 tests, lint and OpenAPI validation.
Staging acceptance for B13 remains open.
