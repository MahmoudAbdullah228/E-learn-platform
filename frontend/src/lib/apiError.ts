import type { FetchBaseQueryError } from '@reduxjs/toolkit/query';
import type { ApiErrorDetail, ApiErrorPayload } from '@/types/api';

export interface ParsedApiError {
  status: number | null;
  code: string;
  message: string;
  details: ApiErrorDetail[];
  retryAfterSeconds: number | null;
}

const KNOWN_ERROR_GUIDANCE: Record<string, string> = {
  VALIDATION_ERROR: 'Please check the highlighted form fields.',
  INVALID_JSON: 'Invalid request payload format.',
  ROUTE_NOT_FOUND: 'Requested API route was not found.',
  PAYLOAD_TOO_LARGE: 'Request payload exceeds the 1 MB limit.',
  INVALID_OR_EXPIRED_VERIFICATION_TOKEN:
    'This verification link is invalid or expired. Request a new verification email.',
  INVALID_OR_EXPIRED_PASSWORD_RESET_TOKEN:
    'This password reset link is invalid or expired. Request a new reset email.',
  PASSWORD_RESET_IN_PROGRESS:
    'A password reset is already in progress. Wait briefly and retry, or use the newer email link.',
  RESOURCE_ALREADY_EXISTS:
    'An account with this email already exists. Log in or resend verification.',
  APPLICATION_ALREADY_PENDING:
    'You already have a pending instructor application.',
  INSTRUCTOR_ALREADY_APPROVED:
    'Your account is already approved as an instructor.',
  APPLICATION_ALREADY_REVIEWED:
    'This application has already been reviewed. Refresh the list.',
  APPLICANT_STATE_CONFLICT:
    'Applicant state changed. Refresh before retrying.',
  INSTRUCTOR_NOT_FOUND: 'Instructor profile was not found.',
  INSTRUCTOR_PROFILE_INCOMPLETE:
    'Please provide both bio and expertise to initialize your instructor profile.',
  INVALID_CATEGORY: 'Please choose an active category.',
  COURSE_NOT_FOUND: 'Course was not found.',
  INVALID_COURSE_STATE:
    'Course state does not permit this action right now.',
  COURSE_NOT_READY:
    'Complete all required course fields, cover, sections, and videos before submitting.',
  COURSE_CHANGED_DURING_REVIEW:
    'Course changed after submission; reject and request resubmission.',
  COURSE_SLUG_CONFLICT:
    'Could not allocate a unique course URL. Please try saving again.',
  CURRICULUM_NOT_FOUND: 'Curriculum content was not found.',
  INVALID_CURRICULUM_ORDER:
    'Curriculum changed concurrently. Reloaded latest order; please try again.',
  CURRICULUM_LIMIT_REACHED:
    'Maximum limit of 200 items reached for this parent.',
  VIDEO_UPLOAD_IN_PROGRESS:
    'A video upload is already in progress for this lesson.',
  VIDEO_ALREADY_EXISTS:
    'This lesson already has a ready video.',
  VIDEO_PROVIDER_UNAVAILABLE:
    'Video provider is temporarily unavailable. Please retry later.',
  INVALID_CREDENTIALS: 'Invalid email or password.',
  INVALID_REFRESH_TOKEN: 'Your session has expired. Please log in again.',
  AUTHENTICATION_REQUIRED: 'Please log in to continue.',
  EMAIL_NOT_VERIFIED: 'Please verify your email address before logging in.',
  ACCOUNT_SUSPENDED:
    'Your account has been suspended. Please contact support.',
  INSUFFICIENT_PERMISSIONS:
    'You do not have permission to perform this action.',
  REQUEST_ORIGIN_DENIED:
    'Request origin was denied by the API.',
  CORS_ORIGIN_DENIED:
    'Frontend origin is not allowed by the API CORS configuration.',
  EMAIL_DELIVERY_UNAVAILABLE:
    'Email delivery is temporarily unavailable. Use resend verification to try again.',
  INTERNAL_SERVER_ERROR:
    'An unexpected server error occurred. Please try again.',
};

export function isApiErrorPayload(value: unknown): value is ApiErrorPayload {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  if (!candidate.error || typeof candidate.error !== 'object') return false;
  const err = candidate.error as Record<string, unknown>;
  return typeof err.code === 'string' && typeof err.message === 'string';
}

export function parseApiError(
  error: unknown,
  fallbackMessage = 'Something went wrong. Please try again.',
): ParsedApiError {
  if (!error || typeof error !== 'object') {
    return {
      status: null,
      code: 'UNKNOWN_ERROR',
      message: fallbackMessage,
      details: [],
      retryAfterSeconds: null,
    };
  }

  const rtkError = error as FetchBaseQueryError & {
    status?: number | string;
    data?: unknown;
  };

  const numericStatus = typeof rtkError.status === 'number' ? rtkError.status : null;
  const retryAfterSeconds =
    rtkError.data &&
    typeof rtkError.data === 'object' &&
    typeof (rtkError.data as Record<string, unknown>).retryAfterSeconds === 'number'
      ? ((rtkError.data as Record<string, unknown>).retryAfterSeconds as number)
      : null;

  if (isApiErrorPayload(rtkError.data)) {
    const code = rtkError.data.error.code;
    return {
      status: numericStatus,
      code,
      message:
        rtkError.data.error.message ||
        KNOWN_ERROR_GUIDANCE[code] ||
        fallbackMessage,
      details: Array.isArray(rtkError.data.error.details)
        ? rtkError.data.error.details
        : [],
      retryAfterSeconds,
    };
  }

  if (rtkError.status === 'FETCH_ERROR') {
    return {
      status: null,
      code: 'NETWORK_ERROR',
      message: 'Unable to reach the server. Please check your connection and try again.',
      details: [],
      retryAfterSeconds: null,
    };
  }

  return {
    status: numericStatus,
    code: numericStatus === 429 ? 'RATE_LIMIT_EXCEEDED' : 'UNKNOWN_ERROR',
    message: fallbackMessage,
    details: [],
    retryAfterSeconds,
  };
}
