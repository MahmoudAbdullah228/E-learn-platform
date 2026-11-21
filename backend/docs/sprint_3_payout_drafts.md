# S3-09 — Settlement preview and payout drafts

S3-09 adds four admin operations under the existing `/api/v1` base. OpenAPI is 1.6.0.

| Operation | Result |
| --- | --- |
| GET `/admin/instructors/:instructorId/settlement-preview` | Read-only signed balance, selected line count and blocking reasons |
| POST `/admin/payouts` | 201 for a new reserved draft, 200 for an exact replay |
| GET `/admin/payouts` | Newest-first cursor pagination with optional instructor and status filters |
| GET `/admin/payouts/:payoutId` | Current payout status/revision, current instructor hold flag and original signed items |

Preview accepts `month` and `cutoffAt`. Creation takes these same fields plus
`instructorId` in the body and requires an `Idempotency-Key` header. For example, a
completed November 2026 period uses `month=2026-11` and `cutoffAt=2026-11-30T22:00:00Z`.
The cutoff must have passed when the command runs. The calendar is Africa/Cairo and
timestamps are returned in UTC. The period is half-open. A cutoff within the month
includes sales at that instant. A cutoff equal to period end excludes sales at that
boundary. Positive carry-forward from earlier months remains eligible. All known
eligible negative adjustments are included, even those newer than a historical cutoff.

An active payout, unresolved financial evidence or holds, a non-positive net, or a
balance beyond the supported capacity yields a conflict. The selection is bounded at
1,000 eligible and deferred rows combined. An oversized set or unsafe integer total
returns `EARNINGS_CAPACITY_EXCEEDED`. This protects against reserving a partial balance.

Creation rechecks the admin session, recalculates the balance and writes the draft,
instructor finance pointer, earning claims, immutable PayoutItems and audit receipt in
the same transaction. A confirmed refund can cancel the draft and release unaffected
claims through the existing refund reducer. The original line items remain available.
Reuse the same key and input after a network error. The receipt always represents the
original draft. Get the current payout before acting on its status.

The existing Payout and PayoutItem models retain their uniqueness constraints. Two new
Payout indexes support unfiltered and status-filtered newest-first listing. Separate
admin read and write rate limits apply. Responses use `Cache-Control: no-store` and
omit keys, fingerprints and transfer credentials.

Transfer submission, confirmation and manual cancellation are S3-10. Staging
settlement acceptance is pending.

The local full run passed 632 of 633 tests. The sole failure was the Swagger test's
old 61-path expectation. After updating it to 64 paths and adding the new admin
authorization assertions, both Swagger HTTP tests passed on rerun. ESLint and
OpenAPI validation also passed on the final files. The integration tests covered
signed carry-forward, concurrent reservation, replay, refund cancellation,
capacity limits and rollback on a final audit write failure.
