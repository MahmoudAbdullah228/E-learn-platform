import mongoose from 'mongoose';

import { financialModelOptions, financialReference, safeIntegerField } from './financialFields.js';
import { protectFinancialHistory } from './protectFinancialHistory.js';

const schema = new mongoose.Schema({
  payoutId: financialReference('Payout'), earningEntryId: financialReference('EarningEntry'),
  instructorId: financialReference('User'),
  type: { type: String, enum: ['sale', 'refund_adjustment'], required: true },
  amountMinor: { ...safeIntegerField(-Number.MAX_SAFE_INTEGER), required: true,
    validate: [{ validator: Number.isSafeInteger, message: 'Amount must be a safe integer' },
      { validator(value) { return this.type === 'sale' ? value >= 0 : value < 0; },
        message: 'Amount must match the ledger entry type' }] },
  currency: { type: String, enum: ['EGP'], required: true },
}, financialModelOptions);
protectFinancialHistory(schema, { appendOnly: true });
schema.index({ payoutId: 1, earningEntryId: 1 }, { unique: true });
schema.index({ earningEntryId: 1 });
export const PayoutItem = mongoose.model('PayoutItem', schema);
