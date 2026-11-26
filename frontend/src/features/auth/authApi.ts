import { baseApi } from '@/app/baseApi';
import {
  clearAuth,
  setAuthStatus,
  setCredentials,
  setUser,
} from '@/features/auth/authSlice';
import type { ApiSuccessEnvelope, UserDto } from '@/types/api';

export interface RegisterRequest {
  name: string;
  email: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponseData {
  accessToken: string;
  expiresInSeconds: number;
  user: UserDto;
}

export interface RefreshResponseData {
  accessToken: string;
  expiresInSeconds: number;
}

export interface VerifyEmailRequest {
  token: string;
}

export interface ResendVerificationRequest {
  email: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  token: string;
  password: string;
}

export const authApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    register: builder.mutation<ApiSuccessEnvelope<{ user: UserDto }>, RegisterRequest>({
      query: (body) => ({
        url: '/auth/register',
        method: 'POST',
        body,
      }),
    }),
    verifyEmail: builder.mutation<
      ApiSuccessEnvelope<{ verified: boolean }>,
      VerifyEmailRequest
    >({
      query: (body) => ({
        url: '/auth/verify-email',
        method: 'POST',
        body,
      }),
    }),
    resendVerification: builder.mutation<
      ApiSuccessEnvelope<Record<string, never>>,
      ResendVerificationRequest
    >({
      query: (body) => ({
        url: '/auth/resend-verification',
        method: 'POST',
        body,
      }),
    }),
    login: builder.mutation<ApiSuccessEnvelope<LoginResponseData>, LoginRequest>({
      query: (body) => ({
        url: '/auth/login',
        method: 'POST',
        body,
        credentials: 'include',
      }),
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        dispatch(setAuthStatus('authenticating'));
        try {
          const { data: envelope } = await queryFulfilled;
          dispatch(
            setCredentials({
              accessToken: envelope.data.accessToken,
              user: envelope.data.user,
            }),
          );
          // Populate canonical user object right after login per Phase 2 rules
          void dispatch(authApi.endpoints.getMe.initiate(undefined, { forceRefetch: true }));
        } catch {
          dispatch(setAuthStatus('unauthenticated'));
        }
      },
    }),
    refreshSession: builder.mutation<ApiSuccessEnvelope<RefreshResponseData>, void>({
      query: () => ({
        url: '/auth/refresh',
        method: 'POST',
        credentials: 'include',
      }),
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        dispatch(setAuthStatus('authenticating'));
        try {
          const { data: envelope } = await queryFulfilled;
          dispatch(setCredentials({ accessToken: envelope.data.accessToken }));
          await dispatch(
            authApi.endpoints.getMe.initiate(undefined, { forceRefetch: true }),
          ).unwrap();
        } catch {
          dispatch(clearAuth());
        }
      },
    }),
    logout: builder.mutation<ApiSuccessEnvelope<Record<string, never>>, void>({
      query: () => ({
        url: '/auth/logout',
        method: 'POST',
        credentials: 'include',
      }),
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled;
          dispatch(clearAuth());
          dispatch(baseApi.util.resetApiState());
        } catch {
          // Do not assume server-side revocation succeeded if 429/network failed.
        }
      },
    }),
    logoutAll: builder.mutation<ApiSuccessEnvelope<Record<string, never>>, void>({
      query: () => ({
        url: '/auth/logout-all',
        method: 'POST',
      }),
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled;
          dispatch(clearAuth());
          dispatch(baseApi.util.resetApiState());
        } catch {
          // Respect 429 Retry-After; only clear when revocation succeeds.
        }
      },
    }),
    forgotPassword: builder.mutation<
      ApiSuccessEnvelope<Record<string, never>>,
      ForgotPasswordRequest
    >({
      query: (body) => ({
        url: '/auth/forgot-password',
        method: 'POST',
        body,
      }),
    }),
    resetPassword: builder.mutation<
      ApiSuccessEnvelope<{ passwordReset: boolean }>,
      ResetPasswordRequest
    >({
      query: (body) => ({
        url: '/auth/reset-password',
        method: 'POST',
        body,
      }),
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled;
          dispatch(clearAuth());
          dispatch(baseApi.util.resetApiState());
        } catch {
          // Ignore on error
        }
      },
    }),
    getMe: builder.query<ApiSuccessEnvelope<{ user: UserDto }>, void>({
      query: () => '/users/me',
      providesTags: ['User'],
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          const { data: envelope } = await queryFulfilled;
          dispatch(setUser(envelope.data.user));
        } catch {
          // Handled by baseQueryWithReauth / guards
        }
      },
    }),
    updateMe: builder.mutation<ApiSuccessEnvelope<{ user: UserDto }>, { name: string }>({
      query: (body) => ({
        url: '/users/me',
        method: 'PATCH',
        body: { name: body.name },
      }),
      invalidatesTags: ['User'],
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          const { data: envelope } = await queryFulfilled;
          dispatch(setUser(envelope.data.user));
        } catch {
          // Error surfaced by caller
        }
      },
    }),
  }),
});

export const {
  useRegisterMutation,
  useVerifyEmailMutation,
  useResendVerificationMutation,
  useLoginMutation,
  useRefreshSessionMutation,
  useLogoutMutation,
  useLogoutAllMutation,
  useForgotPasswordMutation,
  useResetPasswordMutation,
  useGetMeQuery,
  useLazyGetMeQuery,
  useUpdateMeMutation,
} = authApi;
