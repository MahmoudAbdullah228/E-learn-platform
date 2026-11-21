import mongoose from 'mongoose';

import { financialKeyField, financialModelOptions, financialReference, fingerprintField,
  requireModelCondition, safeIntegerField } from './financialFields.js';
import { protectFinancialHistory } from './protectFinancialHistory.js';
import { containsUnsafeCharacter } from '../utils/textValidation.js';
import { auditActions, auditStatuses, auditTargetTypes } from '../utils/auditTypes.js';

const schema = new mongoose.Schema({
  actorType: { type: String, enum: ['user', 'system'], required: true },
  actorId: financialReference('User', false),
  action: { type: String, required: true, enum: auditActions },
  targetType: { type: String, required: true, enum: auditTargetTypes },
  targetId: { type: mongoose.Schema.Types.ObjectId, required: true },
  fromStatus: { type: String, enum: [...auditStatuses, null], default: null },
  toStatus: { type: String, enum: [...auditStatuses, null], default: null },
  reason: { type: String, default: null, trim: true, minlength: 10, maxlength: 500,
    validate: value => value == null || !containsUnsafeCharacter(value) },
  evidenceReference: { type: String, default: null, select: false, minlength: 3, maxlength: 128,
    match: /^[A-Z0-9][A-Z0-9._/-]+$/ },
  requestId: { type: String, default: null, maxlength: 100, match: /^[A-Za-z0-9_.:-]+$/ },
  idempotencyKey: { ...financialKeyField, default: null },
  requestFingerprint: { ...fingerprintField, default: null },
  result: { type: new mongoose.Schema({
    resourceId: { type: mongoose.Schema.Types.ObjectId, required: true },
    status: { type: String, required: true, maxlength: 40, match: /^[a-z_]+$/ },
    revision: safeIntegerField(),
    httpStatus: { type: Number, required: true, enum: [200, 201, 202] },
  }, { _id: false, strict: 'throw' }), default: null, select: false },
  occurredAt: { type: Date, required: true },
}, financialModelOptions);
schema.pre('validate', function validateAudit() {
  requireModelCondition(this, (this.actorType === 'user') === Boolean(this.actorId),
    'actorId', 'User audit events require an actor; system events do not impersonate users');
  requireModelCondition(this, this.idempotencyKey
    ? this.actorType === 'user' && this.requestFingerprint && this.result
    : !this.requestFingerprint && !this.result, 'idempotencyKey', 'Audited command receipts must be complete');
});
protectFinancialHistory(schema, { appendOnly: true });
schema.index({ actorId: 1, action: 1, idempotencyKey: 1 }, { unique: true,
  partialFilterExpression: { actorId: { $type: 'objectId' }, idempotencyKey: { $type: 'string' } } });
schema.index({ targetType: 1, targetId: 1, occurredAt: -1, _id: -1 });
schema.index({ actorId: 1, occurredAt: -1, _id: -1 });
export const AdminAuditEvent = mongoose.model('AdminAuditEvent', schema);
