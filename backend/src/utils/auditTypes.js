export const auditActions = Object.freeze(['financial_policy.created', 'refund.requested', 'refund.succeeded',
  'refund.failed', 'refund.reconciliation_required', 'financial_hold.opened', 'financial_hold.resolved',
  'payout.created', 'payout.submitted', 'payout.paid', 'payout.cancelled', 'payout.reconciled',
  'user.status_changed', 'course.archived', 'course.access_policy_changed', 'course.media_unavailable', 'course.corrected',
  'course_revision.created', 'course_revision.submitted', 'course_revision.approved',
  'course_revision.rejected', 'course_revision.discarded']);

export const auditTargetTypes = Object.freeze(['financial_policy', 'refund', 'payout', 'earning_entry',
  'financial_hold', 'user', 'course', 'course_revision']);

export const auditStatuses = Object.freeze(['active', 'suspended', 'draft', 'pending', 'paid', 'cancelled',
  'requested', 'processing', 'requires_reconciliation', 'succeeded', 'failed', 'eligible',
  'included_in_payout', 'reversed', 'pending_review', 'published', 'rejected', 'archived',
  'unavailable', 'available', 'blocked', 'approved', 'discarded', 'open', 'resolved']);
