import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { logger, serializeError } from '../src/config/logger.js';
import { assertTransactionSupport } from '../src/config/transactions.js';
import { AdminAuditEvent } from '../src/models/AdminAuditEvent.js';
import { EarningEntry } from '../src/models/EarningEntry.js';
import { FinancialHold } from '../src/models/FinancialHold.js';
import { InstructorFinanceState } from '../src/models/InstructorFinanceState.js';
import { WebhookEvent } from '../src/models/WebhookEvent.js';
import { createEligibilityOperationsService } from '../src/modules/earnings/eligibilityOperations.service.js';
import { eligibilityOperationSchema } from '../src/modules/earnings/earnings.schemas.js';
import { createEarningsEligibilityWorker } from '../src/services/earningsEligibilityWorker.service.js';

let worker;
try {
  const input = {}; const args = process.argv.slice(2);
  const names = { '--entry-id': 'entryId', '--execute': 'execute' };
  for (let index = 0; index < args.length; index++) {
    const key = Object.hasOwn(names, args[index]) ? names[args[index]] : null;
    if (!key || Object.hasOwn(input, key)) throw new Error('Invalid eligibility arguments');
    if (key === 'execute') input[key] = true;
    else {
      const value = args[++index];
      if (!value || value.startsWith('--')) throw new Error('Invalid eligibility arguments');
      input[key] = value;
    }
  }
  const operation = eligibilityOperationSchema.parse(input);
  if (operation.execute) {
    await connectDatabase(); await assertTransactionSupport();
    await Promise.all([EarningEntry, InstructorFinanceState, FinancialHold, AdminAuditEvent, WebhookEvent].map(Model => Model.init()));
  }
  worker = createEarningsEligibilityWorker();
  logger.info(await createEligibilityOperationsService({ worker }).run(operation), 'Earnings eligibility operation completed');
} catch (error) {
  logger.error(serializeError(error), 'Earnings eligibility operation failed'); process.exitCode = 1;
} finally { await worker?.stop(); await disconnectDatabase(); }
