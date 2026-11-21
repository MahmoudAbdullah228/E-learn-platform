import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { logger, serializeError } from '../src/config/logger.js';
import { assertTransactionSupport } from '../src/config/transactions.js';
import { Refund } from '../src/models/Refund.js';
import { WebhookEvent } from '../src/models/WebhookEvent.js';
import { createRefundOperationsService, refundOperationSchema } from '../src/modules/refunds/refundOperations.service.js';
import { createRefundRecoveryWorker } from '../src/services/refundRecoveryWorker.service.js';
import { stripePaymentProvider } from '../src/services/stripePayment.service.js';

let worker;
try {
  const options = {}; const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index += 1) {
    const name = { '--refund-id': 'refundId', '--execute': 'execute' }[args[index]];
    if (!name || Object.hasOwn(options, name)) throw new Error('Invalid refund operation arguments');
    options[name] = name === 'execute' ? true : args[++index];
  }
  const input = refundOperationSchema.parse(options);
  if (input.execute) {
    await connectDatabase(); await assertTransactionSupport();
    await Promise.all([Refund.init(), WebhookEvent.init()]);
  }
  worker = createRefundRecoveryWorker({ provider: stripePaymentProvider, issuanceEnabled: false });
  logger.info(await createRefundOperationsService({ worker }).run(input), 'Refund reconciliation completed');
} catch (error) {
  logger.error(serializeError(error), 'Refund reconciliation failed'); process.exitCode = 1;
} finally { await worker?.stop(); await disconnectDatabase(); }
