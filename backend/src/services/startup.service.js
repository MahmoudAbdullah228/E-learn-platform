export async function startHttpServer({
  connectDatabase,
  disconnectDatabase,
  isShuttingDown,
  listen,
  signal,
  prepareDatabase = async () => {},
}) {
  try {
    await connectDatabase({ signal });
    signal?.throwIfAborted();
    await prepareDatabase();
  } catch (error) {
    if (!signal?.aborted) throw error;
    await disconnectDatabase();
    return null;
  }

  if (isShuttingDown()) {
    await disconnectDatabase();
    return null;
  }

  return listen();
}
