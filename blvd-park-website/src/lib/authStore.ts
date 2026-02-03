import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api } from './api';

interface AuthState {
  token: string | null;
  isAuthenticated: boolean;
  login: (apiKey: string) => Promise<boolean>;
  logout: () => void;
  checkAuth: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, _get) => ({
      token: null,
      isAuthenticated: false,

      login: async (apiKey: string) => {
        const isValid = await api.verifyAuth(apiKey);
        if (isValid) {
          localStorage.setItem('blvd-auth-token', apiKey);
          set({ token: apiKey, isAuthenticated: true });
          return true;
        }
        return false;
      },

      logout: () => {
        localStorage.removeItem('blvd-auth-token');
        set({ token: null, isAuthenticated: false });
      },

      checkAuth: () => {
        const token = localStorage.getItem('blvd-auth-token');
        if (token) {
          set({ token, isAuthenticated: true });
          return true;
        }
        return false;
      },
    }),
    { name: 'blvd-auth' }
  )
);
