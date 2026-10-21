import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { logger, serializeError } from '../src/config/logger.js';
import { assertTransactionSupport } from '../src/config/transactions.js';
import { WebhookEvent } from '../src/models/WebhookEvent.js';
import { createPaymentInboxService } from '../src/modules/payments/paymentInbox.service.js';
import { createPaymentOperationsService,
  paymentOperationSchema } from '../src/modules/payments/paymentOperations.service.js';
import { stripePaymentProvider } from '../src/services/stripePayment.service.js';

try {
  const options = {};
  const args = process.argv.slice(2);
  const names = { '--event-id': 'eventId', '--order-id': 'orderId',
    '--replay': 'replay', '--execute': 'execute' };
  for (let index = 0; index < args.length; index += 1) {
    const name = names[args[index]];
    if (!name || Object.hasOwn(options, name)) throw new Error('Invalid payment operation arguments');
    options[name] = ['replay', 'execute'].includes(name) ? true : args[++index];
  }
  const input = paymentOperationSchema.parse(options);
  if (input.execute) {
    await connectDatabase();
    await assertTransactionSupport();
    await WebhookEvent.init();
  }
  const operations = createPaymentOperationsService({ provider: stripePaymentProvider,
    inbox: createPaymentInboxService({ provider: stripePaymentProvider }) });
  logger.info(await operations.run(input), 'Payment event operation completed');
} catch (error) {
  logger.error(serializeError(error), 'Payment event operation failed');
  process.exitCode = 1;
} finally { await disconnectDatabase(); }
