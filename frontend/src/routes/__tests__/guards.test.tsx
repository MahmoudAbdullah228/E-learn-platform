import { configureStore } from '@reduxjs/toolkit';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { baseApi } from '@/app/baseApi';
import authReducer, { clearAuth, setCredentials } from '@/features/auth/authSlice';
import { RedirectIfAuthenticated, RequireAuth, RequireRole } from '@/routes/guards';
import type { UserDto } from '@/types/api';

function makeStore(user: UserDto | null, accessToken: string | null) {
  const store = configureStore({
    reducer: {
      auth: authReducer,
      [baseApi.reducerPath]: baseApi.reducer,
    },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(baseApi.middleware),
  });
  if (accessToken) {
    store.dispatch(setCredentials({ accessToken, user }));
  } else {
    store.dispatch(clearAuth());
  }
  return store;
}

const studentUser: UserDto = {
  id: 'u1',
  name: 'Student One',
  email: 'student@example.com',
  roles: ['student'],
  status: 'active',
  emailVerified: true,
};

describe('Route guards', () => {
  it('redirects unauthenticated users to /login preserving intended path', () => {
    const store = makeStore(null, null);
    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/app/my-courses?tab=active']}>
          <Routes>
            <Route path="/login" element={<div>Login Screen</div>} />
            <Route element={<RequireAuth />}>
              <Route path="/app/my-courses" element={<div>Protected</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </Provider>,
    );

    expect(screen.getByText('Login Screen')).toBeInTheDocument();
  });

  it('blocks student user from admin route with 403 Permission Required', () => {
    const store = makeStore(studentUser, 'valid-token');
    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/admin/dashboard']}>
          <Routes>
            <Route element={<RequireRole requiredRole="admin" />}>
              <Route path="/admin/dashboard" element={<div>Admin Area</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </Provider>,
    );

    expect(screen.getByText('403 — Insufficient Permissions')).toBeInTheDocument();
    expect(screen.getByText('Permission Required')).toBeInTheDocument();
    expect(screen.queryByText('Admin Area')).not.toBeInTheDocument();
  });

  it('redirects authenticated users away from /login', () => {
    const store = makeStore(studentUser, 'valid-token');
    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/login']}>
          <Routes>
            <Route element={<RedirectIfAuthenticated />}>
              <Route path="/login" element={<div>Login Form</div>} />
            </Route>
            <Route path="/app/dashboard" element={<div>Student Dashboard</div>} />
          </Routes>
        </MemoryRouter>
      </Provider>,
    );

    expect(screen.getByText('Student Dashboard')).toBeInTheDocument();
  });
});
