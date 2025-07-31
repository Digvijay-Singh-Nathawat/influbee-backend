'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuthStore } from '@/lib/store/auth'
import { useWalletStore } from '@/lib/store/wallet'
import VideoCall from './video-call'
import { agoraApi, callApi, chatApi } from '@/lib/api'

interface User {
  id: string
  username: string
  displayName?: string
}

export function CallInterface() {
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [availableUsers, setAvailableUsers] = useState<User[]>([])
  const [callType, setCallType] = useState<'VOICE' | 'VIDEO'>('VOICE')
  const [estimatedDuration, setEstimatedDuration] = useState(5)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [activeCall, setActiveCall] = useState<{
    callId: string
    channelName: string
    callType: 'VOICE' | 'VIDEO'
    estimatedDuration: number
    callerId: string
    receiverId: string
    isInitiator: boolean
  } | null>(null)

  const { user } = useAuthStore()
  const { balance, fetchBalance } = useWalletStore()

  useEffect(() => {
    fetchUsers()
    fetchBalance()
  }, [fetchBalance])

  const fetchUsers = async () => {
    try {
      const response = await chatApi.getAvailableUsers()
      if (response.data.success) {
        setAvailableUsers(response.data.data)
      }
    } catch (error) {
      console.error('Failed to fetch users:', error)
    }
  }

  const calculateCallCost = (duration: number, type: 'VOICE' | 'VIDEO'): number => {
    const ratePerMinute = type === 'VIDEO' ? 50000 : 35000 // in paisa
    return duration * ratePerMinute
  }

  const startCall = async () => {
    if (!selectedUser || !user) {
      setError('Please select a user to call')
      return
    }

    const estimatedCost = calculateCallCost(estimatedDuration, callType)
    if (balance < estimatedCost) {
      setError('Insufficient balance for this call')
      return
    }

    try {
      setIsLoading(true)
      setError('')

      // Initiate call through backend
      const response = await callApi.initiate({
        receiverId: selectedUser.id,
        callType,
        estimatedDuration
      })

      if (response.data.success) {
        const callData = response.data.data
        setActiveCall({
          callId: callData.id,
          channelName: callData.channelName,
          callType,
          estimatedDuration,
          callerId: user?.id || '',
          receiverId: selectedUser.id,
          isInitiator: true
        })
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Failed to start call'
      setError(errorMessage)
      console.error('Error starting call:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const endCall = useCallback(() => {
    setActiveCall(null)
    fetchBalance() // Refresh balance after call
  }, [fetchBalance])

  if (activeCall) {
    return (
      <VideoCall
        callId={activeCall.callId}
        channelName={activeCall.channelName}
        callType={activeCall.callType}
        estimatedDuration={activeCall.estimatedDuration}
        callerId={activeCall.callerId}
        receiverId={activeCall.receiverId}
        isInitiator={activeCall.isInitiator}
        onCallEnd={endCall}
      />
    )
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Start a Call</h2>
      
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      <div className="space-y-6">
        {/* User Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select User to Call
          </label>
          <select
            value={selectedUser?.id || ''}
            onChange={(e) => {
              const userId = e.target.value
              const user = availableUsers.find(u => u.id === userId)
              setSelectedUser(user || null)
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
            disabled={isLoading}
          >
            <option value="">Choose a user...</option>
            {availableUsers.map(user => (
              <option key={user.id} value={user.id}>
                {user.displayName || user.username} (@{user.username})
              </option>
            ))}
          </select>
        </div>

        {/* Call Type Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Call Type
          </label>
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => setCallType('VOICE')}
              disabled={isLoading}
              className={`p-4 rounded-lg border-2 transition-colors ${
                callType === 'VOICE'
                  ? 'border-green-500 bg-green-50 text-green-700'
                  : 'border-gray-300 hover:border-green-300'
              } disabled:opacity-50`}
            >
              <div className="text-3xl mb-2">📞</div>
              <div className="font-medium">Voice Call</div>
              <div className="text-sm text-gray-500">₹350/minute</div>
            </button>
            <button
              onClick={() => setCallType('VIDEO')}
              disabled={isLoading}
              className={`p-4 rounded-lg border-2 transition-colors ${
                callType === 'VIDEO'
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-300 hover:border-blue-300'
              } disabled:opacity-50`}
            >
              <div className="text-3xl mb-2">🎥</div>
              <div className="font-medium">Video Call</div>
              <div className="text-sm text-gray-500">₹500/minute</div>
            </button>
          </div>
        </div>

        {/* Duration Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Estimated Duration
          </label>
          <select
            value={estimatedDuration}
            onChange={(e) => setEstimatedDuration(Number(e.target.value))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
            disabled={isLoading}
          >
            <option value={1}>1 minute</option>
            <option value={2}>2 minutes</option>
            <option value={5}>5 minutes</option>
            <option value={10}>10 minutes</option>
            <option value={15}>15 minutes</option>
            <option value={30}>30 minutes</option>
            <option value={60}>1 hour</option>
          </select>
        </div>

        {/* Cost Calculation */}
        <div className="bg-gray-50 p-4 rounded-lg">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-gray-700">Estimated Cost:</span>
            <span className="text-xl font-bold text-purple-600">
              ₹{(calculateCallCost(estimatedDuration, callType) / 100).toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between items-center text-sm text-gray-500">
            <span>Your Balance:</span>
            <span>₹{(balance / 100).toFixed(2)}</span>
          </div>
          {balance < calculateCallCost(estimatedDuration, callType) && (
            <div className="mt-2 text-sm text-red-600 font-medium">
              ⚠️ Insufficient balance. Please add funds to your wallet.
            </div>
          )}
        </div>

        {/* Start Call Button */}
        <button
          onClick={startCall}
          disabled={
            !selectedUser || 
            isLoading || 
            balance < calculateCallCost(estimatedDuration, callType)
          }
          className="w-full py-3 px-4 bg-purple-600 text-white font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isLoading ? (
            <div className="flex items-center justify-center">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
              Starting Call...
            </div>
          ) : (
            `Start ${callType === 'VOICE' ? 'Voice' : 'Video'} Call`
          )}
        </button>

        {/* Feature Notice */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h4 className="font-medium text-blue-900 mb-2">✨ Powered by Agora</h4>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• High-quality HD video and crystal-clear audio</li>
            <li>• Low-latency real-time communication</li>
            <li>• Global coverage with 200+ data centers</li>
            <li>• Real-time billing based on actual usage</li>
          </ul>
        </div>
      </div>
    </div>
  )
} 