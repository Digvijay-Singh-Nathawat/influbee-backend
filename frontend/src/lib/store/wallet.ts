import { create } from 'zustand'
import { walletApi } from '../api'
import { io, Socket } from 'socket.io-client'

export interface Transaction {
  id: string
  type: string
  amount: number
  description: string
  createdAt: string
  status: string
}

interface WalletState {
  balance: number
  transactions: Transaction[]
  isLoading: boolean
  socket: Socket | null
  isConnected: boolean
}

interface WalletActions {
  fetchBalance: () => Promise<void>
  fetchTransactions: (limit?: number) => Promise<void>
  updateBalance: (newBalance: number) => void
  addTransaction: (transaction: Transaction) => void
  connectSocket: (userId: string) => void
  disconnectSocket: () => void
}

export const useWalletStore = create<WalletState & WalletActions>((set, get) => ({
  balance: 0,
  transactions: [],
  isLoading: false,
  socket: null,
  isConnected: false,

  fetchBalance: async () => {
    try {
      set({ isLoading: true })
      const response = await walletApi.getBalance()
      // Only log balance changes, not every response
      const currentBalance = get().balance
      if (currentBalance !== response.data.balance) {
        console.log('Balance updated:', response.data.balance)
      }
      set({ balance: response.data.balance, isLoading: false })
    } catch (error) {
      console.error('Error fetching balance:', error)
      set({ isLoading: false })
    }
  },

  fetchTransactions: async (limit = 50) => {
    try {
      const response = await walletApi.getTransactions(limit)
      set({ transactions: response.data.transactions })
    } catch (error) {
      console.error('Error fetching transactions:', error)
    }
  },

  updateBalance: (newBalance: number) => {
    set({ balance: newBalance })
  },

  addTransaction: (transaction: Transaction) => {
    set(state => ({
      transactions: [transaction, ...state.transactions]
    }))
  },

  connectSocket: (userId: string) => {
    const currentSocket = get().socket
    
    // Don't reconnect if already connected with same user
    if (currentSocket && currentSocket.connected && currentSocket.id) {
      return
    }
    
    // Disconnect existing socket if any
    if (currentSocket) {
      currentSocket.removeAllListeners()
      currentSocket.disconnect()
    }
    
    try {
      // Connect to the /wallet namespace specifically
      const socket = io('http://localhost:3001/wallet', {
        transports: ['websocket', 'polling'],
        query: { userId },
        forceNew: true,
        autoConnect: true,
        timeout: 15000, // Increased timeout
        reconnection: true,
        reconnectionAttempts: 2, // Further reduced attempts
        reconnectionDelay: 5000, // Increased delay
        reconnectionDelayMax: 10000, // Increased max delay
        // Additional options to reduce rapid reconnects
        multiplex: false,
        upgrade: true,
        rememberUpgrade: true,
      })

      socket.on('connect', () => {
        console.log('Connected to wallet service')
        set({ isConnected: true })
      })

      socket.on('disconnect', (reason: any) => {
        console.log('Disconnected from wallet service:', reason)
        set({ isConnected: false })
        
        // Only log connection attempts if not due to client disconnect
        if (reason !== 'client namespace disconnect' && reason !== 'io client disconnect') {
          console.log('Will attempt to reconnect...')
        }
      })

      socket.on('balance:updated', (data: { balance: number }) => {
        console.log('Real-time balance update:', data.balance)
        set({ balance: data.balance })
      })

      socket.on('transaction:added', (data: { transaction: Transaction }) => {
        console.log('New transaction received:', data.transaction)
        get().addTransaction(data.transaction)
        // Fetch updated balance
        get().fetchBalance()
      })

      socket.on('connect_error', (error) => {
        console.warn('Wallet socket connection error:', error.message)
        set({ isConnected: false })
        // Only log fallback message for actual connection errors
        if (error.message !== 'websocket error' && error.message !== 'xhr poll error') {
          console.log('Falling back to polling for balance updates')
        }
      })

      socket.on('reconnect_attempt', (attemptNumber) => {
        console.log(`Wallet socket reconnection attempt ${attemptNumber}`)
      })

      socket.on('reconnect_failed', () => {
        console.warn('Wallet socket reconnection failed - falling back to polling')
        set({ isConnected: false })
      })

      set({ socket, isConnected: socket.connected })
    } catch (error) {
      console.error('Failed to create wallet socket:', error)
      set({ isConnected: false })
    }
  },

  disconnectSocket: () => {
    const socket = get().socket
    if (socket) {
      socket.removeAllListeners()
      socket.disconnect()
      set({ socket: null, isConnected: false })
    }
  }
})) 