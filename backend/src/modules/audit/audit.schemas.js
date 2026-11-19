import { z } from 'zod';

import { auditActions, auditStatuses, auditTargetTypes } from '../../utils/auditTypes.js';
import { financialIdSchema, financialKeySchema, financialReasonSchema,
  fingerprintSchema, revisionSchema, transferReferenceSchema } from '../finance/finance.schemas.js';

const resultSchema = z.object({ resourceId: financialIdSchema,
  status: z.string().min(1).max(40).regex(/^[a-z_]+$/), revision: revisionSchema.optional(),
  httpStatus: z.union([z.literal(200), z.literal(201), z.literal(202)]) }).strict();

export const auditInputSchema = z.object({
  actorType: z.enum(['user', 'system']),
  actorId: financialIdSchema.nullable().default(null),
  action: z.enum(auditActions), targetType: z.enum(auditTargetTypes), targetId: financialIdSchema,
  fromStatus: z.enum(auditStatuses).nullable().default(null),
  toStatus: z.enum(auditStatuses).nullable().default(null),
  reason: financialReasonSchema.nullable().default(null),
  evidenceReference: transferReferenceSchema.optional(),
  requestId: z.string().min(1).max(100).regex(/^[A-Za-z0-9_.:-]+$/).nullable().default(null),
  idempotencyKey: financialKeySchema.nullable().default(null),
  requestFingerprint: fingerprintSchema.nullable().default(null),
  result: resultSchema.nullable().default(null),
}).strict().superRefine((value, ctx) => {
  if ((value.actorType === 'user') !== (value.actorId !== null)) {
    ctx.addIssue({ code: 'custom', path: ['actorId'], message: 'Only user actors require an identity' });
  }
  if (value.idempotencyKey ? !value.requestFingerprint || !value.result || value.actorType !== 'user'
    : value.requestFingerprint !== null || value.result !== null) {
    ctx.addIssue({ code: 'custom', path: ['idempotencyKey'], message: 'Command receipts must be complete and user scoped' });
  }
});
