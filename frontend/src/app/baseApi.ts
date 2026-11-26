import {
  createApi,
  fetchBaseQuery,
  type BaseQueryFn,
  type FetchArgs,
  type FetchBaseQueryError,
} from '@reduxjs/toolkit/query/react';
import { clearAuth, setAccessToken, type AuthState } from '@/features/auth/authSlice';
import type { ApiSuccessEnvelope } from '@/types/api';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

if (!API_BASE_URL) {
  throw new Error('VITE_API_BASE_URL is not configured.');
}

interface RefreshResponseData {
  accessToken: string;
  expiresInSeconds: number;
}

interface RootStateWithAuth {
  auth: AuthState;
}

const rawBaseQuery = fetchBaseQuery({
  baseUrl: API_BASE_URL,
  prepareHeaders: (headers, { getState }) => {
    const token = (getState() as RootStateWithAuth).auth.accessToken;
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    return headers;
  },
});

const NON_REFRESHABLE_PATHS = [
  '/auth/login',
  '/auth/refresh',
  '/auth/logout',
  '/auth/register',
  '/auth/verify-email',
  '/auth/resend-verification',
  '/auth/forgot-password',
  '/auth/reset-password',
];

function getRequestUrl(args: string | FetchArgs): string {
  return typeof args === 'string' ? args : args.url;
}

let inFlightRefreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(
  api: Parameters<BaseQueryFn>[1],
  extraOptions: Parameters<BaseQueryFn>[2],
): Promise<string | null> {
  if (inFlightRefreshPromise) {
    return inFlightRefreshPromise;
  }

  inFlightRefreshPromise = (async () => {
    const refreshResult = await rawBaseQuery(
      {
        url: '/auth/refresh',
        method: 'POST',
        credentials: 'include',
      },
      api,
      extraOptions,
    );

    if (refreshResult.error) {
      return null;
    }

    const envelope = refreshResult.data as ApiSuccessEnvelope<RefreshResponseData> | undefined;
    const newAccessToken = envelope?.data?.accessToken ?? null;
    if (!newAccessToken) {
      return null;
    }

    api.dispatch(setAccessToken(newAccessToken));
    return newAccessToken;
  })();

  try {
    return await inFlightRefreshPromise;
  } finally {
    inFlightRefreshPromise = null;
  }
}

export const baseQueryWithReauth: BaseQueryFn<
  string | FetchArgs,
  unknown,
  FetchBaseQueryError
> = async (args, api, extraOptions) => {
  let result = await rawBaseQuery(args, api, extraOptions);

  const url = getRequestUrl(args);
  const isNonRefreshable = NON_REFRESHABLE_PATHS.some((path) => url.startsWith(path));

  if (result.error && result.error.status === 401 && !isNonRefreshable) {
    const newToken = await refreshAccessToken(api, extraOptions);

    if (newToken) {
      result = await rawBaseQuery(args, api, extraOptions);
    } else {
      api.dispatch(clearAuth());
      api.dispatch(baseApi.util.resetApiState());
    }
  }

  if (result.error && result.error.status === 429) {
    const retryAfterRaw = result.meta?.response?.headers.get('Retry-After');
    if (retryAfterRaw) {
      const parsed = Number.parseInt(retryAfterRaw, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        const existingData =
          result.error.data && typeof result.error.data === 'object'
            ? (result.error.data as Record<string, unknown>)
            : {};
        result.error = {
          ...result.error,
          data: { ...existingData, retryAfterSeconds: parsed },
        };
      }
    }
  }

  return result;
};

export const baseApi = createApi({
  reducerPath: 'api',
  baseQuery: baseQueryWithReauth,
  tagTypes: [
    'User',
    'InstructorApplication',
    'InstructorProfile',
    'Category',
    'Course',
    'Curriculum',
    'Catalog',
    'Enrollment',
    'Order',
    'AdminUser',
    'CourseRevision',
    'Refund',
    'Finance',
    'Payout',
  ],
  endpoints: () => ({}),
});
