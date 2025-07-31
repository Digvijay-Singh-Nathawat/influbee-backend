import { create } from 'zustand'
import { authApi } from '../api'

export interface User {
  id: string
  email: string
  username: string
  role: 'USER' | 'INFLUENCER'
  displayName?: string
  avatar?: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

interface AuthState {
  user: User | null
  token: string | null
  isLoading: boolean
  isAuthenticated: boolean
}

interface AuthActions {
  login: (username: string, password: string) => Promise<void>
  register: (data: {
    email: string
    username: string
    password: string
    role?: 'USER' | 'INFLUENCER'
    displayName?: string
  }) => Promise<void>
  logout: () => void
  checkAuth: () => Promise<void>
  setUser: (user: User) => void
  setLoading: (loading: boolean) => void
}

export const useAuthStore = create<AuthState & AuthActions>((set, get) => ({
  user: null,
  token: null,
  isLoading: true,
  isAuthenticated: false,

  login: async (username: string, password: string) => {
    try {
      set({ isLoading: true })
      const response = await authApi.login({ username, password })
      const { user, access_token } = response.data
      
      localStorage.setItem('token', access_token)
      localStorage.setItem('user', JSON.stringify(user))
      
      set({
        user,
        token: access_token,
        isAuthenticated: true,
        isLoading: false
      })
    } catch (error) {
      set({ isLoading: false })
      throw error
    }
  },

  register: async (data) => {
    try {
      set({ isLoading: true })
      const response = await authApi.register(data)
      const { user, access_token } = response.data
      
      localStorage.setItem('token', access_token)
      localStorage.setItem('user', JSON.stringify(user))
      
      set({
        user,
        token: access_token,
        isAuthenticated: true,
        isLoading: false
      })
    } catch (error) {
      set({ isLoading: false })
      throw error
    }
  },

  logout: () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    set({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false
    })
  },

  checkAuth: async () => {
    try {
      const token = localStorage.getItem('token')
      const userStr = localStorage.getItem('user')
      
      if (!token || !userStr) {
        set({ isLoading: false })
        return
      }

      // Verify token with backend
      const response = await authApi.getCurrentUser()
      const user = response.data.user
      
      set({
        user,
        token,
        isAuthenticated: true,
        isLoading: false
      })
    } catch (error) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      set({
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false
      })
    }
  },

  setUser: (user: User) => set({ user }),
  setLoading: (loading: boolean) => set({ isLoading: loading })
})) 