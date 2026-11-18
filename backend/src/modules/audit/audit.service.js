import { AdminAuditEvent } from '../../models/AdminAuditEvent.js';
import { auditInputSchema } from './audit.schemas.js';

export async function appendAuditEvent({ session, input, occurredAt }) {
  if (!session?.inTransaction()) throw new TypeError('Audit requires the mutation transaction');
  const event = auditInputSchema.parse(input);
  if (!(occurredAt instanceof Date) || !Number.isFinite(occurredAt.getTime())) {
    throw new TypeError('A valid audit timestamp is required');
  }
  const [saved] = await AdminAuditEvent.create([{ ...event, occurredAt }], { session });
  return saved;
}
