export function closeHttpServer(server, { timeoutMs, logger }) {
  if (!server) {
    return Promise.resolve({ forced: false });
  }

  return new Promise((resolve) => {
    let settled = false;

    const finish = (forced) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      resolve({ forced });
    };

    const timeout = setTimeout(() => {
      logger.warn({ timeoutMs }, 'HTTP shutdown deadline exceeded; closing connections');
      server.closeAllConnections?.();
      finish(true);
    }, timeoutMs);

    server.close((error) => {
      if (error) {
        logger.warn({ errorType: error.name }, 'HTTP server close reported an error');
      }
      finish(false);
    });
  });
}
