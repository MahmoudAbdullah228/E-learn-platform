import { useEffect, useRef } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { ChunkFallback } from '@/components/common/ChunkFallback';
import { useGetMeQuery, useRefreshSessionMutation } from '@/features/auth/authApi';
import { clearAuth } from '@/features/auth/authSlice';
import { parseApiError } from '@/lib/apiError';
import { ForbiddenPage } from '@/pages/ForbiddenPage';
import type { UserRole } from '@/types/api';

interface RoleGuardProps {
  requiredRole: UserRole;
}

function getDefaultDashboard(roles: UserRole[] = []): string {
  if (roles.includes('admin')) return '/admin/dashboard';
  if (roles.includes('instructor')) return '/instructor/dashboard';
  return '/app/dashboard';
}

/**
 * Enforces authenticated session on every guarded route, including hard page refreshes.
 * When in-memory accessToken is absent (hard refresh), attempts one silent refresh via
 * HttpOnly cookie and fetches GET /users/me. When accessToken is present, re-checks
 * GET /users/me on mount so role/suspension changes take effect immediately.
 */
export function RequireAuth() {
  const location = useLocation();
  const dispatch = useAppDispatch();
  const { accessToken, user, status } = useAppSelector((state) => state.auth);
  const [refreshSession, { isLoading: isRefreshing }] = useRefreshSessionMutation();
  const attemptedRefreshRef = useRef(false);

  useEffect(() => {
    if (!accessToken && status !== 'unauthenticated' && !attemptedRefreshRef.current) {
      attemptedRefreshRef.current = true;
      void refreshSession();
    }
  }, [accessToken, refreshSession, status]);

  const {
    isLoading: isLoadingMe,
    isFetching: isFetchingMe,
    isError: isMeError,
    error: meError,
  } = useGetMeQuery(undefined, {
    skip: !accessToken,
    refetchOnMountOrArgChange: true,
  });

  if (!accessToken) {
    if (status === 'unauthenticated') {
      const intended = `${location.pathname}${location.search}`;
      return (
        <Navigate
          to={`/login?redirect=${encodeURIComponent(intended)}`}
          replace
        />
      );
    }
    return <ChunkFallback />;
  }

  if (isRefreshing || (!user && (isLoadingMe || isFetchingMe))) {
    return <ChunkFallback />;
  }

  if (isMeError) {
    const parsed = parseApiError(meError);
    if (parsed.status === 401 || parsed.code === 'ACCOUNT_SUSPENDED') {
      dispatch(clearAuth());
      const intended = `${location.pathname}${location.search}`;
      return (
        <Navigate
          to={`/login?redirect=${encodeURIComponent(intended)}`}
          replace
          state={{
            notice:
              parsed.code === 'ACCOUNT_SUSPENDED'
                ? 'Your account has been suspended. Please contact support.'
                : 'Your session has expired. Please log in again.',
          }}
        />
      );
    }
    if (parsed.status === 403) {
      return <ForbiddenPage description={parsed.message} />;
    }
  }

  if (!user) {
    const intended = `${location.pathname}${location.search}`;
    return (
      <Navigate
        to={`/login?redirect=${encodeURIComponent(intended)}`}
        replace
      />
    );
  }

  if (user.status === 'suspended') {
    dispatch(clearAuth());
    return (
      <Navigate
        to="/login"
        replace
        state={{ notice: 'Your account has been suspended. Please contact support.' }}
      />
    );
  }

  return <Outlet />;
}

/**
 * Reads roles strictly from the fetched `user` object — never from the URL.
 * Renders a 403 Forbidden view without retry loops when lacking permission.
 */
export function RequireRole({ requiredRole }: RoleGuardProps) {
  const user = useAppSelector((state) => state.auth.user);

  if (!user) {
    return <ChunkFallback />;
  }

  if (!user.roles.includes(requiredRole)) {
    return (
      <ForbiddenPage
        title="Permission Required"
        description={`This area requires ${requiredRole} permissions.`}
      />
    );
  }

  return <Outlet />;
}

/**
 * Prevents approved instructors from re-entering `/instructor/apply`.
 */
export function RequireNonInstructor() {
  const user = useAppSelector((state) => state.auth.user);

  if (user?.roles.includes('instructor')) {
    return <Navigate to="/instructor/dashboard" replace />;
  }

  return <Outlet />;
}

/**
 * Redirects already-authenticated users away from `/login` and `/register`.
 */
export function RedirectIfAuthenticated() {
  const { accessToken, user } = useAppSelector((state) => state.auth);

  if (accessToken && user) {
    return <Navigate to={getDefaultDashboard(user.roles)} replace />;
  }

  return <Outlet />;
}
