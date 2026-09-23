import { app } from './src/app.js';
import { connectDatabase, disconnectDatabase } from './src/config/db.js';
import { env } from './src/config/env.js';
import { logger, serializeError } from './src/config/logger.js';
import { closeHttpServer } from './src/services/shutdown.service.js';
import { startHttpServer } from './src/services/startup.service.js';

let httpServer;
let isShuttingDown = false;

async function startServer() {
  httpServer = await startHttpServer({
    connectDatabase,
    disconnectDatabase,
    isShuttingDown: () => isShuttingDown,
    listen: () =>
      app.listen(env.PORT, () => {
        logger.info({ port: env.PORT }, 'API server listening');
      }),
  });
}

async function shutdown(signal, exitCode = 0) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  logger.info({ signal }, 'Graceful shutdown started');

  await closeHttpServer(httpServer, {
    timeoutMs: env.SHUTDOWN_TIMEOUT_MS,
    logger,
  });

  await disconnectDatabase();
  process.exitCode = exitCode;
}

process.once('SIGINT', () => {
  void shutdown('SIGINT');
});

process.once('SIGTERM', () => {
  void shutdown('SIGTERM');
});

process.once('unhandledRejection', (error) => {
  logger.fatal(serializeError(error), 'Unhandled promise rejection');
  void shutdown('unhandledRejection', 1);
});

process.once('uncaughtException', (error) => {
  logger.fatal(serializeError(error), 'Uncaught exception');
  void shutdown('uncaughtException', 1);
});

startServer().catch((error) => {
  logger.fatal(serializeError(error), 'API startup failed');
  void shutdown('startupFailure', 1);
});
