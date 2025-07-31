'use client'

import { useState, useEffect, useRef } from 'react'
import { chatApi } from '@/lib/api'
import { useWalletStore } from '@/lib/store/wallet'

interface Message {
  id: string
  content: string
  senderId: string
  receiverId: string
  createdAt: string
  isOwn: boolean
  sender: {
    id: string
    username: string
    displayName: string
  }
}

interface ChatInterfaceProps {
  currentUserId: string
  selectedUserId?: string
  onUserSelect?: (userId: string) => void
}

export function ChatInterface({ currentUserId, selectedUserId, onUserSelect }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [selectedPartnerId, setSelectedPartnerId] = useState<string>(selectedUserId || '')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const { balance, updateBalance, fetchBalance } = useWalletStore()

  // Available users for chat (hardcoded for now, should come from props or API)
  const availableUsers = [
    { id: 'c04ccccf-22f4-44c6-a331-1144f12f99ed', name: 'Test User', username: 'testuser' },
    { id: '75b5e74e-cd58-41d4-bf09-772c1bdf266f', name: 'Test Influencer', username: 'testinfluencer' },
    { id: 'inf2', name: 'Jane Creator', username: 'creator_jane' },
    { id: 'user2', name: 'John Doe', username: 'john_doe' },
  ].filter(user => user.id !== currentUserId)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  useEffect(() => {
    if (selectedUserId && selectedUserId !== selectedPartnerId) {
      setSelectedPartnerId(selectedUserId)
      loadConversation(selectedUserId)
    }
  }, [selectedUserId])

  // Auto-refresh messages every 30 seconds (reduced from 5 seconds)
  useEffect(() => {
    if (!selectedPartnerId) return

    const interval = setInterval(() => {
      loadConversation(selectedPartnerId)
    }, 30000) // Increased from 5 seconds to reduce server load

    return () => clearInterval(interval)
  }, [selectedPartnerId])

  const loadConversation = async (partnerId: string) => {
    try {
      setSelectedPartnerId(partnerId)
      const response = await chatApi.getConversation(partnerId)
      setMessages(response.data.data || [])
    } catch (error) {
      console.error('Error loading conversation:', error)
    }
  }

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedPartnerId) return

    try {
      setIsLoading(true)
      setError('')
      
      // Send via API (which handles billing and real-time delivery via Agora)
      const response = await chatApi.sendMessage({
        receiverId: selectedPartnerId,
        content: newMessage.trim()
      })

      if (response.data.success) {
        // Add message to local state immediately for better UX
        const message: Message = {
          id: response.data.data.message.id,
          content: newMessage.trim(),
          senderId: currentUserId,
          receiverId: selectedPartnerId,
          createdAt: new Date().toISOString(),
          isOwn: true,
          sender: {
            id: currentUserId,
            username: currentUserId,
            displayName: currentUserId,
          },
        }

        setMessages(prev => [...prev, message])
        setNewMessage('')
        
        // Refresh balance after sending message
        fetchBalance()
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Failed to send message'
      setError(errorMessage)
      console.error('Error sending message:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const handleUserSelect = (userId: string) => {
    loadConversation(userId)
    onUserSelect?.(userId)
  }

  return (
    <div className="bg-white rounded-lg shadow h-96 flex flex-col">
      {/* Chat Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Chat</h3>
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 rounded-full bg-green-500"></div>
            <span className="text-xs text-gray-500">
              Agora RTC Ready
            </span>
          </div>
        </div>
        {!selectedPartnerId && (
          <p className="text-sm text-gray-500">Select a user from the list to start chatting</p>
        )}
      </div>

      {/* Partner Selection */}
      <div className="p-4 border-b border-gray-200">
        <select
          value={selectedPartnerId}
          onChange={(e) => {
            const partnerId = e.target.value
            if (partnerId) {
              handleUserSelect(partnerId)
            } else {
              setSelectedPartnerId('')
              setMessages([])
            }
          }}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
        >
          <option value="">Select user to chat with...</option>
          {availableUsers.map(user => (
            <option key={user.id} value={user.id}>
              {user.name} (@{user.username})
            </option>
          ))}
        </select>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="text-center text-gray-500 text-sm">
            {selectedPartnerId ? 'No messages yet. Start the conversation!' : 'Select a user to view messages'}
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.isOwn ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-xs lg:max-w-md px-3 py-2 rounded-lg ${
                  message.isOwn
                    ? 'bg-purple-500 text-white'
                    : 'bg-gray-200 text-gray-900'
                }`}
              >
                <p className="text-sm">{message.content}</p>
                <p className="text-xs mt-1 opacity-75">
                  {new Date(message.createdAt).toLocaleTimeString()}
                </p>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Message Input */}
      {selectedPartnerId && (
        <div className="p-4 border-t border-gray-200">
          {error && (
            <div className="mb-2 text-sm text-red-600 bg-red-50 p-2 rounded">
              {error}
            </div>
          )}
          <div className="flex space-x-2">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Type a message..."
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              disabled={isLoading}
            />
            <button
              onClick={sendMessage}
              disabled={isLoading || !newMessage.trim()}
              className="px-4 py-2 bg-purple-500 text-white rounded-lg text-sm font-medium hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Sending...' : 'Send'}
            </button>
          </div>
          <div className="mt-2 text-xs text-gray-500">
            Cost: ₹100 per message • Balance: ₹{(balance / 100).toFixed(2)}
          </div>
        </div>
      )}
    </div>
  )
} 