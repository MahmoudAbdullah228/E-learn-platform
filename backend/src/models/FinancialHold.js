import mongoose from 'mongoose';

import { financialModelOptions, financialReference, requireModelCondition, safeCodeField } from './financialFields.js';
import { protectFinancialHistory, protectWriteOnce } from './protectFinancialHistory.js';

const schema = new mongoose.Schema({
  instructorId: financialReference('User'),
  paymentId: financialReference('Payment', false),
  sourceType: { type: String, enum: ['refund', 'payment', 'payout', 'dispute', 'legacy', 'operations'], required: true },
  sourceId: { type: String, required: true, maxlength: 128, match: /^[A-Za-z0-9_.:-]+$/ },
  reasonCode: { ...safeCodeField, required: true },
  openedBy: financialReference('User', false),
  openedAt: { type: Date, required: true },
  resolvedAt: { type: Date, default: null },
  resolvedBy: financialReference('User', false),
  resolutionCode: { ...safeCodeField, default: null },
}, financialModelOptions);
schema.pre('validate', function validateResolution() {
  requireModelCondition(this, this.resolvedAt ? this.resolvedAt >= this.openedAt && this.resolutionCode
    : !this.resolutionCode && !this.resolvedBy, 'resolvedAt', 'Hold resolution must be complete and ordered');
});
protectFinancialHistory(schema, { immutableFields: ['instructorId', 'sourceType', 'sourceId',
  'reasonCode', 'openedBy', 'openedAt', 'paymentId'] });
protectWriteOnce(schema, ['resolvedAt', 'resolvedBy', 'resolutionCode']);
schema.index({ instructorId: 1, sourceType: 1, sourceId: 1 }, { unique: true });
schema.index({ instructorId: 1, resolvedAt: 1, openedAt: 1 });
schema.index({ paymentId: 1, resolvedAt: 1 });
export const FinancialHold = mongoose.model('FinancialHold', schema);
