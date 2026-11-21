import { AdminAuditEvent } from '../../models/AdminAuditEvent.js';
import { auditInputSchema } from './audit.schemas.js';

export async function appendAuditEvent({ session, input, occurredAt }) {
  const [saved] = await appendAuditEvents({ session, inputs: [input], occurredAt });
  return saved;
}

export async function appendAuditEvents({ session, inputs, occurredAt }) {
  if (!session?.inTransaction()) throw new TypeError('Audit requires the mutation transaction');
  if (!(occurredAt instanceof Date) || !Number.isFinite(occurredAt.getTime())) {
    throw new TypeError('A valid audit timestamp is required');
  }
  // Validate and insert without tracking nested receipt documents for save rollback.
  const events = inputs.map(input => ({ ...auditInputSchema.parse(input), occurredAt }));
  return AdminAuditEvent.insertMany(events, { session });
}
