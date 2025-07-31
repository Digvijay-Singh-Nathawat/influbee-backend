import axios from 'axios'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'

export const api = axios.create({
  baseURL: API_URL,
  timeout: 10000,
})

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    // Check if we're on the client side before accessing localStorage
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('token')
      if (token) {
        config.headers.Authorization = `Bearer ${token}`
      }
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response interceptor to handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Check if we're on the client side before accessing localStorage and window
      if (typeof window !== 'undefined') {
        localStorage.removeItem('token')
        localStorage.removeItem('user')
        window.location.href = '/'
      }
    }
    return Promise.reject(error)
  }
)

// Auth API
export const authApi = {
  register: (data: {
    email: string
    username: string
    password: string
    role?: 'USER' | 'INFLUENCER'
    displayName?: string
  }) => api.post('/auth/register', data),

  login: (data: { username: string; password: string }) =>
    api.post('/auth/login', data),

  getProfile: () => api.get('/auth/profile'),

  getCurrentUser: () => api.get('/auth/me'),
}

// Wallet API
export const walletApi = {
  getBalance: () => api.get('/wallet/balance'),
  getTransactions: (limit = 50) => api.get(`/wallet/transactions?limit=${limit}`),
  transfer: (data: { recipientId: string; amount: number; description?: string }) =>
    api.post('/wallet/transfer', data),
  topUp: (data: { amount: number; paymentToken: string; paymentMethod?: string }) =>
    api.post('/wallet/top-up', data),
  addMoney: (data: { amount: number; paymentData: any; paymentMethod?: string }) =>
    api.post('/wallet/add-money', data),
  withdrawal: (data: { amount: number; withdrawalMethod: string; bankDetails?: any }) =>
    api.post('/wallet/withdrawal', data),
}

// Google Pay API
export const googlePayApi = {
  getConfig: () => api.get('/google-pay/config'),
  getPaymentMethods: () => api.get('/google-pay/payment-methods'),
  createPaymentData: (data: { amount: number; currency?: string }) =>
    api.post('/google-pay/create-payment-data', data),
  processPayment: (data: { amount: number; paymentData: any; paymentMethod?: string }) =>
    api.post('/google-pay/process-payment', data),
  processWithdrawal: (data: { amount: number; withdrawalMethod: string; bankDetails?: any }) =>
    api.post('/google-pay/process-withdrawal', data),
}

// Chat API
export const chatApi = {
  sendMessage: (data: { receiverId: string; content: string }) =>
    api.post('/chat/messages', data),
  
  getConversation: (partnerId: string) =>
    api.get(`/chat/conversations/${partnerId}`),
  
  getAvailableUsers: () => api.get('/chat/users/available'),
  
  getRecentConversations: () => api.get('/chat/conversations'),
  
  getChatStats: () => api.get('/chat/stats'),
}

// Call API
export const callApi = {
  initiate: (data: {
    receiverId: string
    callType: 'VOICE' | 'VIDEO'
    estimatedDuration: number
  }) => api.post('/calls/initiate', data),
  
  start: (data: { callId: string }) => 
    api.post('/calls/start', data),
  
  end: (data: { callId: string; actualDuration: number }) =>
    api.post('/calls/end', data),
  
  cancel: (callId: string) => 
    api.post(`/calls/${callId}/cancel`),
  
  getHistory: () => api.get('/calls/history'),
  
  getActive: () => api.get('/calls/active'),
}

// Agora API
export const agoraApi = {
  // Get comprehensive Agora credentials (Chat + RTC)
  getUserCredentials: () => api.post('/agora/credentials'),
  
  // Chat SDK token
  getChatToken: (data: { expirationInSeconds?: number } = {}) =>
    api.post('/agora/token/chat', data),
  
  // RTC token for Video/Voice calling
  getRtcToken: (data: {
    channelName: string
    role?: string
    expirationInSeconds?: number
  }) => api.post('/agora/token/rtc', data),
  
  // Generate channel name for calls
  generateChannelName: (data: { receiverId: string }) =>
    api.post('/agora/channel/generate', data),
  
  // Legacy RTM support (redirects to Chat token)
  getRtmToken: (data: { expirationInSeconds?: number } = {}) =>
    api.post('/agora/token/rtm', data),
}

// Billing API
export const billingApi = {
  getPricing: () => api.get('/billing/pricing'),
  estimateCost: (data: { duration: number; callType: 'VOICE' | 'VIDEO' }) =>
    api.post('/billing/estimate', data),
} 