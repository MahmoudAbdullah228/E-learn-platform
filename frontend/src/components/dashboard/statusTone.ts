export type StatusTone = 'success' | 'teal' | 'error' | 'muted';

export function inferStatusTone(status: string): StatusTone {
  const normalized = status.toLowerCase();
  if (
    [
      'paid',
      'approved',
      'published',
      'active',
      'completed',
      'ready',
      'eligible',
      'succeeded',
    ].includes(normalized)
  ) {
    return 'success';
  }
  if (
    [
      'pending',
      'processing',
      'pending_review',
      'draft',
      'submitted',
      'held',
      'reserved',
    ].includes(normalized)
  ) {
    return 'teal';
  }
  if (
    [
      'failed',
      'rejected',
      'suspended',
      'revoked',
      'unavailable',
      'denied',
      'blocked',
    ].includes(normalized)
  ) {
    return 'error';
  }
  return 'muted';
}
