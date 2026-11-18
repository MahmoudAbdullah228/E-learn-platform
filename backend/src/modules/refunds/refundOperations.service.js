import { z } from 'zod';

import { financialIdSchema } from '../finance/finance.schemas.js';

export const refundOperationSchema = z.object({ refundId: financialIdSchema, execute: z.boolean().default(false) }).strict();
export function createRefundOperationsService({ worker }) {
  return Object.freeze({
    async run(input) {
      const operation = refundOperationSchema.parse(input);
      if (!operation.execute) return { dryRun: true, observed: false };
      return { dryRun: false, observed: await worker.processNext({ refundId: operation.refundId, allowIssue: false }) };
    },
  });
}
