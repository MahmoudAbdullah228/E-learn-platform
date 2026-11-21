import mongoose from 'mongoose';

import { financialModelOptions, financialReference, requireModelCondition } from './financialFields.js';
import { protectFinancialHistory } from './protectFinancialHistory.js';

const schema = new mongoose.Schema({
  version: { type: String, required: true, maxlength: 64, match: /^[a-z0-9][a-z0-9_.-]*$/ },
  effectiveFrom: { type: Date, required: true },
  refundWindowSeconds: { type: Number, required: true, min: 1, max: 365 * 86400, validate: Number.isSafeInteger },
  refundMode: { type: String, enum: ['full'], required: true },
  lateAdminOverrideAllowed: { type: Boolean, required: true },
  eligibilityRule: { type: String, enum: ['after_refund_window_without_holds'], required: true },
  approvalSource: { type: String, enum: ['product_delegation', 'admin_approval'], required: true },
  approvedBy: financialReference('User', false),
  approvedAt: { type: Date, required: true },
  approvalReference: { type: String, required: true, maxlength: 128, match: /^[A-Za-z0-9_.:-]+$/ },
}, financialModelOptions);
schema.pre('validate', function validatePolicy() {
  requireModelCondition(this, this.approvalSource !== 'admin_approval' || this.approvedBy,
    'approvedBy', 'Administrative approval requires an actor');
  requireModelCondition(this, this.approvedAt <= this.effectiveFrom,
    'effectiveFrom', 'Policy must be approved before its activation');
});
protectFinancialHistory(schema, { appendOnly: true });
schema.index({ version: 1 }, { unique: true });
schema.index({ effectiveFrom: 1 }, { unique: true });
export const FinancialPolicyVersion = mongoose.model('FinancialPolicyVersion', schema);
