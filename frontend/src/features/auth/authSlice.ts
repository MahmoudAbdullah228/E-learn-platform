import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { UserDto } from '@/types/api';

export type AuthStatus = 'idle' | 'authenticating' | 'authenticated' | 'unauthenticated';

export interface AuthState {
  accessToken: string | null;
  user: UserDto | null;
  status: AuthStatus;
}

const initialState: AuthState = {
  accessToken: null,
  user: null,
  status: 'idle',
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setCredentials(
      state,
      action: PayloadAction<{ accessToken: string; user?: UserDto | null }>,
    ) {
      state.accessToken = action.payload.accessToken;
      if (action.payload.user !== undefined) {
        state.user = action.payload.user;
      }
      state.status = 'authenticated';
    },
    setAccessToken(state, action: PayloadAction<string>) {
      state.accessToken = action.payload;
      state.status = 'authenticated';
    },
    setUser(state, action: PayloadAction<UserDto | null>) {
      state.user = action.payload;
      if (action.payload && state.accessToken) {
        state.status = 'authenticated';
      }
    },
    setAuthStatus(state, action: PayloadAction<AuthStatus>) {
      state.status = action.payload;
    },
    clearAuth(state) {
      state.accessToken = null;
      state.user = null;
      state.status = 'unauthenticated';
    },
  },
});

export const {
  setCredentials,
  setAccessToken,
  setUser,
  setAuthStatus,
  clearAuth,
} = authSlice.actions;

export default authSlice.reducer;
