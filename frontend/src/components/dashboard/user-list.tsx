'use client'

import { useState, useEffect } from 'react'
import { chatApi } from '@/lib/api'
import { useAgora } from '@/hooks/useAgora'

interface User {
  id: string
  username: string
  displayName?: string
  role: 'USER' | 'INFLUENCER'
  isActive: boolean
}

interface UserListProps {
  currentUserId: string
  userRole: 'USER' | 'INFLUENCER'
  onUserSelect?: (userId: string) => void
}

export function UserList({ currentUserId, userRole, onUserSelect }: UserListProps) {
  const [users, setUsers] = useState<User[]>([])
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
  
  // Get Agora state - only initialize after mount to avoid SSR issues
  const agora = useAgora()
  const { rtmState, getUserOnlineStatus, initializeRTM } = agora

  // Handle client-side mounting
  useEffect(() => {
    setMounted(true)
  }, [])

  // Initialize RTM when component mounts
  useEffect(() => {
    if (mounted && currentUserId) {
      initializeRTM(currentUserId).catch(console.error)
    }
  }, [mounted, currentUserId, initializeRTM])

  // Fetch users with debouncing
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        setLoading(true)
        setError(null)
        
        const response = await chatApi.getAvailableUsers()
        if (response.data.success) {
          // Filter out current user and map to our User interface
          const filteredUsers = response.data.data
            .filter((user: any) => user.id !== currentUserId)
            .map((user: any) => ({
              id: user.id,
              username: user.username,
              displayName: user.displayName,
              role: user.role,
              isActive: user.isActive
            }))
          
          setUsers(filteredUsers)
        } else {
          setError('Failed to load users')
        }
      } catch (err) {
        console.error('Error fetching users:', err)
        setError('Failed to load users')
      } finally {
        setLoading(false)
      }
    }

    if (mounted && currentUserId) {
      // Debounce user fetching to prevent multiple rapid calls
      const timer = setTimeout(() => {
        fetchUsers()
      }, 500)
      
      return () => clearTimeout(timer)
    }
  }, [currentUserId, mounted])

  // Handle user selection
  const handleUserSelect = (user: User) => {
    setSelectedUser(user)
    onUserSelect?.(user.id)
  }

  // Get online status for a user
  const getOnlineStatus = (user: User): boolean => {
    // If RTM is connected, use RTM presence, otherwise fallback to database isActive
    return rtmState.isConnected 
      ? getUserOnlineStatus(user.id)
      : user.isActive
  }

  // Show loading state on server side or while mounting
  if (!mounted) {
    return (
      <div className="flex-1 bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-800">Available Users</h2>
        </div>
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-500">Loading...</div>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex-1 bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-800">Available Users</h2>
        </div>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex-1 bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-800">Available Users</h2>
        </div>
        <div className="flex items-center justify-center h-64">
          <div className="text-red-500">{error}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 bg-white rounded-lg shadow-md p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-gray-800">Available Users</h2>
        <div className="text-sm text-gray-500">
          {users.length} user{users.length !== 1 ? 's' : ''} available
        </div>
      </div>
      
      <div className="space-y-3">
                  {users.map(user => {
            // Use RTM state to check online status, fallback to user.isActive
            const isOnline = getOnlineStatus(user)
          
          return (
            <div
              key={user.id}
              className={`flex items-center justify-between p-3 rounded-lg border transition-all cursor-pointer hover:shadow-md ${
                selectedUser?.id === user.id
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 bg-gray-50 hover:border-gray-300'
              }`}
              onClick={() => handleUserSelect(user)}
            >
              <div className="flex items-center space-x-3">
                {/* Avatar */}
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold">
                  {(user.displayName || user.username).charAt(0).toUpperCase()}
                </div>
                
                {/* User info */}
                <div className="flex-1">
                  <div className="font-medium text-gray-900">
                    {user.displayName || user.username}
                  </div>
                  <div className="text-sm text-gray-500">
                    {user.role === 'INFLUENCER' ? 'Influencer' : 'User'}
                  </div>
                </div>
              </div>
              
              {/* Status indicator */}
              <div className="flex items-center space-x-2">
                <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-gray-400'}`}></div>
                <span className={`text-xs font-medium ${isOnline ? 'text-green-600' : 'text-gray-500'}`}>
                  {isOnline ? 'Online' : 'Offline'}
                </span>
              </div>
            </div>
          )
        })}
      </div>
      
      {users.length === 0 && (
        <div className="flex items-center justify-center h-64 text-gray-500">
          No users available at the moment
        </div>
      )}
    </div>
  )
} 