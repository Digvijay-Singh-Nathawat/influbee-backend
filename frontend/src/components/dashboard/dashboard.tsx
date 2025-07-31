'use client'

import { useEffect, useState } from 'react'
import { useAuthStore } from '@/lib/store/auth'
import { useWalletStore } from '@/lib/store/wallet'
import { WalletCard } from './wallet-card'
import { UserList } from './user-list'
import dynamic from 'next/dynamic'

// Dynamically import AgoraChat to prevent SSR issues
const AgoraChat = dynamic(() => import('../chat/agora-chat'), {
  ssr: false,
  loading: () => (
    <div className="bg-white rounded-lg shadow h-96 flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
    </div>
  )
})

export function Dashboard() {
  const { user, logout } = useAuthStore()
  const { balance, fetchBalance, connectSocket, disconnectSocket } = useWalletStore()
  const [selectedUserId, setSelectedUserId] = useState<string>('')

  useEffect(() => {
    if (user) {
      fetchBalance()
      
      // Delay socket connection slightly to avoid conflicts during Fast Refresh
      const timer = setTimeout(() => {
        connectSocket(user.id)
      }, 100)
      
      // Reduced polling as fallback - every 30 seconds instead of 5
      const interval = setInterval(() => {
        fetchBalance()
      }, 30000)
      
      return () => {
        clearTimeout(timer)
        clearInterval(interval)
        disconnectSocket()
      }
    }
  }, [user, fetchBalance, connectSocket, disconnectSocket])

  if (!user) return null

  const isInfluencer = user.role === 'INFLUENCER'

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-4">
              <h1 className="text-2xl font-bold text-gray-900">
                {isInfluencer ? 'Influencer Dashboard' : 'User Dashboard'}
              </h1>
              <div className="flex items-center space-x-2">
                <div className={`w-3 h-3 rounded-full ${isInfluencer ? 'bg-purple-500' : 'bg-blue-500'}`}></div>
                <span className="text-sm text-gray-600">
                  {user.displayName || user.username}
                </span>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <WalletCard balance={balance} isInfluencer={isInfluencer} />
              <button
                onClick={logout}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: User List */}
          <div className="lg:col-span-1">
            <UserList 
              currentUserId={user.id} 
              userRole={user.role} 
              onUserSelect={setSelectedUserId}
            />
          </div>

          {/* Middle Column: Agora Chat */}
          <div className="lg:col-span-1">
            <AgoraChat 
              userId={user.id}
            />
          </div>

          {/* Right Column: Stats & Info */}
          <div className="lg:col-span-1">
            <div className="space-y-6">
              {/* Stats Card */}
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  {isInfluencer ? 'Earnings Overview' : 'Spending Overview'}
                </h3>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Current Balance</span>
                    <span className="font-semibold text-green-600">₹{(balance / 100).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">
                      {isInfluencer ? 'Messages Received' : 'Messages Sent'}
                    </span>
                    <span className="font-semibold">0</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">
                      {isInfluencer ? 'Calls Received' : 'Calls Made'}
                    </span>
                    <span className="font-semibold">0</span>
                  </div>
                </div>
              </div>

              {/* Pricing Info */}
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Pricing</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Messages:</span>
                    <span className="font-semibold">₹100 each</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Voice Calls:</span>
                    <span className="font-semibold">₹350/min</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Video Calls:</span>
                    <span className="font-semibold">₹500/min</span>
                  </div>
                </div>
                {!isInfluencer && (
                  <div className="mt-4 p-3 bg-blue-50 rounded-md">
                    <p className="text-xs text-blue-700">
                      💡 Charges apply only to users. Influencers earn from these services.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
} 