import { app } from './src/app.js';
import { connectDatabase, disconnectDatabase } from './src/config/db.js';
import { env } from './src/config/env.js';
import { logger } from './src/config/logger.js';
import { closeHttpServer } from './src/services/shutdown.service.js';

let httpServer;
let isShuttingDown = false;

async function startServer() {
  await connectDatabase();

  httpServer = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, 'API server listening');
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
  logger.fatal({ err: error }, 'Unhandled promise rejection');
  void shutdown('unhandledRejection', 1);
});

process.once('uncaughtException', (error) => {
  logger.fatal({ err: error }, 'Uncaught exception');
  void shutdown('uncaughtException', 1);
});

startServer().catch((error) => {
  logger.fatal(
    { errorType: error.name, errorMessage: error.message },
    'API startup failed',
  );
  void shutdown('startupFailure', 1);
});
