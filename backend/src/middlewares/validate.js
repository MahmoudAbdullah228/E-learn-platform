export function validateBody(schema) {
  return function bodyValidationMiddleware(request, response, next) {
    void response;

    const result = schema.safeParse(request.body);
    if (!result.success) {
      next(result.error);
      return;
    }

    request.validatedBody = result.data;
    next();
  };
}
