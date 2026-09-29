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

export function validateQuery(schema) {
  return function queryValidationMiddleware(request, response, next) {
    void response;

    const result = schema.safeParse(request.query);
    if (!result.success) {
      next(result.error);
      return;
    }

    request.validatedQuery = result.data;
    next();
  };
}

export function validateParams(schema) {
  return function paramsValidationMiddleware(request, response, next) {
    void response;

    const result = schema.safeParse(request.params);
    if (!result.success) {
      next(result.error);
      return;
    }

    request.validatedParams = result.data;
    next();
  };
}
