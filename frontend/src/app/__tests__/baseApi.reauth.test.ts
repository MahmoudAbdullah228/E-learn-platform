import { configureStore } from '@reduxjs/toolkit';
import type { BaseQueryApi } from '@reduxjs/toolkit/query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { baseApi, baseQueryWithReauth } from '@/app/baseApi';
import authReducer, { setCredentials } from '@/features/auth/authSlice';

function createTestStore() {
  return configureStore({
    reducer: {
      auth: authReducer,
      [baseApi.reducerPath]: baseApi.reducer,
    },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(baseApi.middleware),
  });
}

function createMockBaseQueryApi(
  store: ReturnType<typeof createTestStore>,
  endpoint = 'getMe',
): BaseQueryApi {
  const controller = new AbortController();
  return {
    dispatch: store.dispatch,
    getState: store.getState,
    extra: undefined,
    endpoint,
    type: 'query',
    signal: controller.signal,
    abort: (reason?: string) => controller.abort(reason),
  };
}

describe('baseQueryWithReauth', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('refreshes once on 401 and retries with the new token', async () => {
    const store = createTestStore();
    store.dispatch(setCredentials({ accessToken: 'expired-token', user: null }));

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementationOnce(async () =>
        new Response(
          JSON.stringify({
            error: { code: 'AUTHENTICATION_REQUIRED', message: 'Expired', details: [] },
          }),
          { status: 401, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockImplementationOnce(async (input) => {
        const req = input as Request;
        expect(req.url).toContain('/auth/refresh');
        expect(req.credentials).toBe('include');
        return new Response(
          JSON.stringify({ data: { accessToken: 'fresh-token', expiresInSeconds: 900 } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      })
      .mockImplementationOnce(async (input) => {
        const req = input as Request;
        expect(req.headers.get('Authorization')).toBe('Bearer fresh-token');
        return new Response(JSON.stringify({ data: { user: { id: '1', name: 'Test' } } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      });

    const result = await baseQueryWithReauth('/users/me', createMockBaseQueryApi(store), {});

    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(result.error).toBeUndefined();
    expect(store.getState().auth.accessToken).toBe('fresh-token');
  });

  it('deduplicates concurrent 401 refresh attempts into a single refresh call', async () => {
    const store = createTestStore();
    store.dispatch(setCredentials({ accessToken: 'expired-token', user: null }));

    let refreshCount = 0;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const req = input as Request;
      if (req.url.includes('/auth/refresh')) {
        refreshCount += 1;
        return new Response(
          JSON.stringify({ data: { accessToken: 'shared-fresh-token', expiresInSeconds: 900 } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (req.headers.get('Authorization') === 'Bearer expired-token') {
        return new Response(
          JSON.stringify({
            error: { code: 'AUTHENTICATION_REQUIRED', message: 'Expired', details: [] },
          }),
          { status: 401, headers: { 'Content-Type': 'application/json' } },
        );
      }

      return new Response(JSON.stringify({ data: { ok: true } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const [res1, res2] = await Promise.all([
      baseQueryWithReauth('/users/me', createMockBaseQueryApi(store, 'ep1'), {}),
      baseQueryWithReauth('/users/me/courses', createMockBaseQueryApi(store, 'ep2'), {}),
    ]);

    expect(refreshCount).toBe(1);
    expect(fetchSpy).toHaveBeenCalledTimes(5);
    expect(res1.error).toBeUndefined();
    expect(res2.error).toBeUndefined();
    expect(store.getState().auth.accessToken).toBe('shared-fresh-token');
  });

  it('clears auth and resets api state when refresh fails', async () => {
    const store = createTestStore();
    store.dispatch(setCredentials({ accessToken: 'expired-token', user: null }));

    vi.spyOn(globalThis, 'fetch')
      .mockImplementationOnce(async () =>
        new Response(
          JSON.stringify({
            error: { code: 'AUTHENTICATION_REQUIRED', message: 'Expired', details: [] },
          }),
          { status: 401, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockImplementationOnce(async () =>
        new Response(
          JSON.stringify({
            error: { code: 'INVALID_REFRESH_TOKEN', message: 'Invalid', details: [] },
          }),
          { status: 401, headers: { 'Content-Type': 'application/json' } },
        ),
      );

    const result = await baseQueryWithReauth('/users/me', createMockBaseQueryApi(store), {});

    expect(result.error?.status).toBe(401);
    expect(store.getState().auth.accessToken).toBeNull();
    expect(store.getState().auth.status).toBe('unauthenticated');
  });
});
