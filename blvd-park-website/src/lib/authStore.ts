import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthState {
  token: string | null;
  isAuthenticated: boolean;
  setToken: (token: string) => void;
  logout: () => void;
  checkAuth: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, _get) => ({
      token: null,
      isAuthenticated: false,

      setToken: (token: string) => {
        localStorage.setItem('blvd-auth-token', token);
        set({ token, isAuthenticated: true });
      },

      logout: () => {
        localStorage.removeItem('blvd-auth-token');
        localStorage.removeItem('blvd-user');
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
