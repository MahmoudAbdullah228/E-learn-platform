import { ZodError } from 'zod';

import { logger } from '../config/logger.js';
import { ApiError } from '../utils/ApiError.js';

export function notFoundHandler(request, response, next) {
  next(
    new ApiError(
      404,
      'ROUTE_NOT_FOUND',
      `Route ${request.method} ${request.path} was not found`,
    ),
  );
}

function normalizeError(error) {
  if (error instanceof ApiError) {
    return error;
  }

  if (error instanceof ZodError) {
    return new ApiError(
      400,
      'VALIDATION_ERROR',
      'The supplied data is invalid',
      error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    );
  }

  const isJsonSyntaxError =
    error instanceof SyntaxError && error?.status === 400 && Object.hasOwn(error, 'body');

  if (error?.type === 'entity.parse.failed' || isJsonSyntaxError) {
    return new ApiError(400, 'INVALID_JSON', 'Request body contains invalid JSON');
  }

  if (error?.type === 'entity.too.large' || error?.status === 413) {
    return new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Request body exceeds the allowed size');
  }

  if (error?.type === 'encoding.unsupported' || error?.status === 415) {
    return new ApiError(415, 'UNSUPPORTED_CONTENT_ENCODING', 'Content encoding is not supported');
  }

  if (error?.code === 11000) {
    return new ApiError(
      409,
      'RESOURCE_ALREADY_EXISTS',
      'A resource with the same unique value already exists',
    );
  }

  if (error?.name === 'ValidationError') {
    return new ApiError(400, 'DATABASE_VALIDATION_ERROR', 'The supplied data is invalid');
  }

  return new ApiError(500, 'INTERNAL_SERVER_ERROR', 'An unexpected error occurred');
}

export function errorHandler(error, request, response, next) {
  void next;

  const normalizedError = normalizeError(error);

  if (normalizedError.statusCode >= 500) {
    const requestLogger = request.log ?? logger;
    requestLogger.error({ err: error }, 'Unhandled request error');
  }

  response.status(normalizedError.statusCode).json({
    error: {
      code: normalizedError.code,
      message: normalizedError.message,
      details: normalizedError.details,
    },
  });
}
