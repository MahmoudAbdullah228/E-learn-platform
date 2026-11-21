export function handleRevision(operation, status = 200) {
  return async (request, response) => {
    const data = await operation({ ...request.validatedParams, auth: request.auth,
      input: request.validatedBody, after: request.validatedQuery?.after });
    response.status(status).json({ data });
  };
}
