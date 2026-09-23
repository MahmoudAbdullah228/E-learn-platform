export async function startHttpServer({
  connectDatabase,
  disconnectDatabase,
  isShuttingDown,
  listen,
}) {
  await connectDatabase();

  if (isShuttingDown()) {
    await disconnectDatabase();
    return null;
  }

  return listen();
}
