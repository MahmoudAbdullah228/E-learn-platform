import { eligibilityOperationSchema } from './earnings.schemas.js';

export function createEligibilityOperationsService({ worker }) {
  return Object.freeze({
    async run(input) {
      const operation = eligibilityOperationSchema.parse(input);
      if (!operation.execute) return { dryRun: true, evaluated: false };
      return { dryRun: false, evaluated: await worker.processNext({ entryId: operation.entryId }) };
    },
  });
}
