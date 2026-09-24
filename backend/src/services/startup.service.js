export async function startHttpServer({
  connectDatabase,
  disconnectDatabase,
  isShuttingDown,
  listen,
  signal,
}) {
  try {
    await connectDatabase({ signal });
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
