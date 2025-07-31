'use client'

import { useState, useEffect, useRef } from 'react'
import { useAuthStore } from '@/lib/store/auth'
import { agoraApi, callApi, api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useAgora } from '@/hooks/useAgora'
import SimpleCall from '@/components/call/video-call'
import io from 'socket.io-client'

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

interface User {
  id: string
  username: string
  displayName: string
  role: string
  isActive: boolean
}

interface IncomingCall {
  callId: string
  callType: 'VOICE' | 'VIDEO'
  channelName: string
  initiator: {
    id: string
    username: string
    displayName: string
  }
}

interface AgoraChatProps {
  userId: string
  token?: string
}

// Connection manager class to handle WebSocket connections
class SocketManager {
  private static instance: SocketManager
  private sockets: Map<string, any> = new Map()
  private reconnectAttempts: Map<string, number> = new Map()
  private maxReconnectAttempts = 2 // Reduced from 5
  private reconnectDelay = 5000 // Increased from 2000
  
  private constructor() {}
  
  static getInstance(): SocketManager {
    if (!SocketManager.instance) {
      SocketManager.instance = new SocketManager()
    }
    return SocketManager.instance
  }
  
  async createSocket(
    namespace: string,
    userId: string,
    onConnect: (socket: any) => void,
    onDisconnect: () => void,
    onError: (error: any) => void
  ): Promise<any> {
    const socketKey = `${namespace}-${userId}`
    
    // Clean up existing socket if any
    if (this.sockets.has(socketKey)) {
      const existingSocket = this.sockets.get(socketKey)
      existingSocket.removeAllListeners()
      existingSocket.disconnect()
      this.sockets.delete(socketKey)
    }
    
    console.log(`🔥 AGORA FRONTEND: Creating ${namespace} socket for user:`, userId)
    
    const socket = io(`http://localhost:3001/${namespace}`, {
      transports: ['websocket'],
      forceNew: true,
      timeout: 15000, // Increased timeout
      reconnection: true,
      reconnectionDelay: this.reconnectDelay,
      reconnectionAttempts: this.maxReconnectAttempts
    })
    
    socket.on('connect', () => {
      console.log(`🔥 AGORA FRONTEND: ${namespace} socket connected`)
      this.reconnectAttempts.set(socketKey, 0)
      socket.emit('user:register', { userId })
      onConnect(socket)
    })
    
    socket.on('disconnect', (reason) => {
      console.log(`🔥 AGORA FRONTEND: ${namespace} socket disconnected:`, reason)
      onDisconnect()
      
      // Don't reconnect if it was a manual disconnect
      if (reason === 'io client disconnect') {
        return
      }
      
      // Implement custom reconnection logic
      this.attemptReconnection(socketKey, namespace, userId, onConnect, onDisconnect, onError)
    })
    
    socket.on('connect_error', (error) => {
      console.error(`🔥 AGORA FRONTEND: ${namespace} socket connection error:`, error)
      onError(error)
      this.attemptReconnection(socketKey, namespace, userId, onConnect, onDisconnect, onError)
    })
    
    socket.on('error', (error) => {
      console.error(`🔥 AGORA FRONTEND: ${namespace} socket error:`, error)
      onError(error)
    })
    
    this.sockets.set(socketKey, socket)
    return socket
  }
  
  private attemptReconnection(
    socketKey: string,
    namespace: string,
    userId: string,
    onConnect: (socket: any) => void,
    onDisconnect: () => void,
    onError: (error: any) => void
  ) {
    const attempts = this.reconnectAttempts.get(socketKey) || 0
    
    if (attempts >= this.maxReconnectAttempts) {
      console.error(`🔥 AGORA FRONTEND: Max reconnection attempts reached for ${namespace}`)
      return
    }
    
    this.reconnectAttempts.set(socketKey, attempts + 1)
    
    setTimeout(() => {
      console.log(`🔥 AGORA FRONTEND: Attempting to reconnect ${namespace} (attempt ${attempts + 1})`)
      this.createSocket(namespace, userId, onConnect, onDisconnect, onError)
    }, this.reconnectDelay * Math.pow(2, attempts)) // Exponential backoff
  }
  
  cleanup(namespace: string, userId: string) {
    const socketKey = `${namespace}-${userId}`
    if (this.sockets.has(socketKey)) {
      const socket = this.sockets.get(socketKey)
      socket.removeAllListeners()
      socket.disconnect()
      this.sockets.delete(socketKey)
      this.reconnectAttempts.delete(socketKey)
    }
  }
  
  getSocket(namespace: string, userId: string): any {
    return this.sockets.get(`${namespace}-${userId}`)
  }
}

export default function AgoraChatComponent({ userId }: AgoraChatProps) {
  // Chat state
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [availableUsers, setAvailableUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(false)
  const [mounted, setMounted] = useState(false)
  
  // Call state
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null)
  const [isInCall, setIsInCall] = useState(false)
  const [callConfig, setCallConfig] = useState<any>(null)
  
  // Connection state
  const [callSocketConnected, setCallSocketConnected] = useState(false)
  const [chatSocketConnected, setChatSocketConnected] = useState(false)
  const [connectionErrors, setConnectionErrors] = useState<string[]>([])
  
  // Error handling
  const [userOnlineStatus, setUserOnlineStatus] = useState<Map<string, boolean>>(new Map())
  const [connectedUsers, setConnectedUsers] = useState<Set<string>>(new Set())
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const socketManager = useRef<SocketManager>(SocketManager.getInstance())
  
  // Use enhanced Agora hook
  const {
    rtmState,
    getUserOnlineStatus,
    initializeRTM,
    sendMessage: sendRTMMessage
  } = useAgora()

  // Handle client-side mounting
  useEffect(() => {
    setMounted(true)
    return () => {
      setMounted(false)
    }
  }, [])

  // Initialize connections
  useEffect(() => {
    if (!mounted || !userId) return

    const initializeConnections = async () => {
      try {
        // Initialize RTM first
        console.log('🔥 AGORA FRONTEND: Initializing RTM for userId:', userId)
        await initializeRTM(userId)
        
        // Then initialize WebSocket connections
        await initializeSocketConnections()
      } catch (error) {
        console.error('🔥 AGORA FRONTEND: ❌ Failed to initialize connections:', error)
        setConnectionErrors(prev => [...prev, `Failed to initialize connections: ${error.message}`])
      }
    }

    initializeConnections()

    return () => {
      // Cleanup on unmount
      socketManager.current.cleanup('call', userId)
      socketManager.current.cleanup('chat', userId)
    }
  }, [mounted, userId, initializeRTM])

  const initializeSocketConnections = async () => {
    // Initialize call socket
    await socketManager.current.createSocket(
      'call',
      userId,
      (socket) => {
        setCallSocketConnected(true)
        setConnectionErrors(prev => prev.filter(e => !e.includes('call')))
        
        // Set up call event listeners
        socket.on('call:incoming', (data: IncomingCall) => {
          console.log('🔥 AGORA FRONTEND: Incoming call received:', data)
          setIncomingCall(data)
        })

        socket.on('call:accepted', (data: any) => {
          console.log('🔥 AGORA FRONTEND: Call accepted:', data)
        })

        socket.on('call:rejected', (data: any) => {
          console.log('🔥 AGORA FRONTEND: Call rejected:', data)
          setIncomingCall(null)
        })

        socket.on('call:ended', (data: any) => {
          console.log('🔥 AGORA FRONTEND: Call ended:', data)
          setIsInCall(false)
          setCallConfig(null)
          setIncomingCall(null)
        })

        socket.on('call:receiver-offline', (data: any) => {
          console.log('🔥 AGORA FRONTEND: Receiver offline:', data)
          setConnectionErrors(prev => [...prev, data.message])
        })

        // Error handlers
        socket.on('call:accept:error', (data: any) => {
          console.error('🔥 AGORA FRONTEND: Call accept error:', data)
          setIncomingCall(null)
        })

        socket.on('call:reject:error', (data: any) => {
          console.error('🔥 AGORA FRONTEND: Call reject error:', data)
          setIncomingCall(null)
        })

        socket.on('call:end:error', (data: any) => {
          console.error('🔥 AGORA FRONTEND: Call end error:', data)
          setIsInCall(false)
          setCallConfig(null)
          setIncomingCall(null)
        })
      },
      () => {
        setCallSocketConnected(false)
      },
      (error) => {
        setCallSocketConnected(false)
        setConnectionErrors(prev => [...prev, `Call connection error: ${error.message}`])
      }
    )

    // Initialize chat socket
    await socketManager.current.createSocket(
      'chat',
      userId,
      (socket) => {
        setChatSocketConnected(true)
        setConnectionErrors(prev => prev.filter(e => !e.includes('chat')))
        
        // Set up chat event listeners
        socket.on('message:received', (data: any) => {
          console.log('🔥 AGORA FRONTEND: Message received:', data)
          setMessages(prev => [...prev, data])
        })

        socket.on('message:sent', (data: any) => {
          console.log('🔥 AGORA FRONTEND: Message sent confirmed:', data)
        })

        socket.on('messages:loaded', (data: any) => {
          console.log('🔥 AGORA FRONTEND: Messages loaded:', data)
          if (data.partnerId && selectedUser?.id === data.partnerId) {
            setMessages(data.messages || [])
          }
        })

        socket.on('typing:partner-typing', (data: any) => {
          console.log('🔥 AGORA FRONTEND: Partner typing:', data)
        })

        // Error handlers
        socket.on('message:error', (data: any) => {
          console.error('🔥 AGORA FRONTEND: Message error:', data)
          setConnectionErrors(prev => [...prev, `Message error: ${data.message}`])
        })

        socket.on('user:register:error', (data: any) => {
          console.error('🔥 AGORA FRONTEND: Chat registration error:', data)
          setConnectionErrors(prev => [...prev, `Chat registration error: ${data.message}`])
        })

        // Listen for user presence events (if backend supports them)
        socket.on('user:online', (data: { userId: string }) => {
          console.log('🔥 AGORA FRONTEND: User came online:', data.userId)
          setConnectedUsers(prev => new Set([...prev, data.userId]))
        })

        socket.on('user:offline', (data: { userId: string }) => {
          console.log('🔥 AGORA FRONTEND: User went offline:', data.userId)
          setConnectedUsers(prev => {
            const newSet = new Set(prev)
            newSet.delete(data.userId)
            return newSet
          })
        })
      },
      () => {
        setChatSocketConnected(false)
      },
      (error) => {
        setChatSocketConnected(false)
        setConnectionErrors(prev => [...prev, `Chat connection error: ${error.message}`])
      }
    )
  }

  // Update online status based on connection status and user data
  useEffect(() => {
    if (!mounted) return

    const newStatus = new Map<string, boolean>()
    availableUsers.forEach(user => {
      // Multi-layered approach to determine online status
      let isOnline = user.isActive || false
      
      // Check if user is in our WebSocket connected users set
      if (connectedUsers.has(user.id)) {
        isOnline = true
      }
      
      // If RTM is connected and has actual presence data, use that (most reliable)
      if (rtmState.isConnected && rtmState.onlineUsers.size > 0) {
        isOnline = getUserOnlineStatus(user.id)
      }
      
      // Fallback: if our services are connected and user is in database, assume they might be online
      if (!isOnline && chatSocketConnected && callSocketConnected && rtmState.isConnected) {
        isOnline = true // Temporary assumption when services are working
      }
      
      newStatus.set(user.id, isOnline)
    })
    setUserOnlineStatus(newStatus)
  }, [mounted, availableUsers, getUserOnlineStatus, rtmState.isConnected, rtmState.onlineUsers, chatSocketConnected, callSocketConnected, connectedUsers])

  // Load available users
  useEffect(() => {
    if (!mounted) return

    const loadUsers = async () => {
      try {
        const response = await api.get('/chat/users/available')
        setAvailableUsers(response.data.data)
      } catch (error) {
        console.error('Failed to load users:', error)
        setConnectionErrors(prev => [...prev, 'Failed to load users'])
      }
    }

    loadUsers()
  }, [mounted])

  // Load messages when user is selected
  useEffect(() => {
    if (mounted && selectedUser) {
      loadMessages(selectedUser.id)
    }
  }, [mounted, selectedUser])

  // Auto-scroll to bottom
  useEffect(() => {
    if (mounted) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [mounted, messages])

  const loadMessages = async (partnerId: string) => {
    try {
      setLoading(true)
      
      const chatSocket = socketManager.current.getSocket('chat', userId)
      
      // Load via WebSocket if connected, otherwise use API
      if (chatSocket && chatSocketConnected) {
        chatSocket.emit('messages:get', { partnerId })
      } else {
        // Fallback to API
        const response = await api.get(`/chat/conversations/${partnerId}`)
        setMessages(response.data.data || [])
      }
    } catch (error) {
      console.error('Failed to load messages:', error)
      setConnectionErrors(prev => [...prev, 'Failed to load messages'])
    } finally {
      setLoading(false)
    }
  }

  const sendMessage = async () => {
    if (!selectedUser || !newMessage.trim()) return

    try {
      setLoading(true)
      setConnectionErrors(prev => prev.filter(e => !e.includes('message')))
      
      const chatSocket = socketManager.current.getSocket('chat', userId)
      
      // Try WebSocket first, fallback to API
      if (chatSocket && chatSocketConnected) {
        // Send via WebSocket
        chatSocket.emit('message:send', {
          receiverId: selectedUser.id,
          content: newMessage.trim()
        })
        
        // Add message to local state immediately for better UX
        const tempMessage: Message = {
          id: `temp-${Date.now()}`,
          content: newMessage.trim(),
          senderId: userId,
          receiverId: selectedUser.id,
          createdAt: new Date().toISOString(),
          isOwn: true,
          sender: {
            id: userId,
            username: userId,
            displayName: userId,
          },
        }

        setMessages(prev => [...prev, tempMessage])
        setNewMessage('')
      } else {
        // Fallback to API + RTM
        const response = await api.post('/chat/messages', {
          receiverId: selectedUser.id,
          content: newMessage.trim(),
        })

        if (response.data.success) {
          // Send via RTM for real-time delivery
          if (rtmState.isConnected) {
            console.log('🔥 AGORA FRONTEND: Sending message via RTM:', {
              receiverId: selectedUser.id,
              message: newMessage.trim()
            })
            await sendRTMMessage(selectedUser.id, newMessage.trim())
          } else {
            console.log('🔥 AGORA FRONTEND: RTM not connected, message sent via API only')
          }
          
          // Add message to local state immediately
          const message: Message = {
            id: response.data.data.message.id,
            content: newMessage.trim(),
            senderId: userId,
            receiverId: selectedUser.id,
            createdAt: new Date().toISOString(),
            isOwn: true,
            sender: {
              id: userId,
              username: userId,
              displayName: userId,
            },
          }

          setMessages(prev => [...prev, message])
          setNewMessage('')
        }
      }
    } catch (error) {
      console.error('Failed to send message:', error)
      setConnectionErrors(prev => [...prev, 'Failed to send message'])
    } finally {
      setLoading(false)
    }
  }

  const initiateCall = async (type: 'VOICE' | 'VIDEO') => {
    if (!selectedUser) return

    try {
      setLoading(true)
      setConnectionErrors(prev => prev.filter(e => !e.includes('call')))
      
      // Request media permissions before initiating the call
      const mediaConstraints = {
        audio: true,
        video: type === 'VIDEO'
      }
      
      console.log('🔥 AGORA FRONTEND: Requesting media permissions:', mediaConstraints)
      await navigator.mediaDevices.getUserMedia(mediaConstraints)
      console.log('🔥 AGORA FRONTEND: Media permissions granted')
      
      console.log('🔥 AGORA FRONTEND: Initiating call:', {
        receiverId: selectedUser.id,
        callType: type,
        estimatedDuration: 5
      })
      
      const response = await callApi.initiate({
        receiverId: selectedUser.id,
        callType: type,
        estimatedDuration: 5,
      })

      if (response.data.success) {
        const callData = response.data.data
        console.log('🔥 AGORA FRONTEND: Call initiated successfully:', callData)
        setCallConfig({
          ...callData,
          callType: type,
          estimatedDuration: 5
        })
        setIsInCall(true)
      }
    } catch (error) {
      console.error('🔥 AGORA FRONTEND: Failed to initiate call:', error)
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        setConnectionErrors(prev => [...prev, 'Media permission denied. Please allow camera/microphone access.'])
      } else {
        setConnectionErrors(prev => [...prev, 'Failed to initiate call'])
      }
    } finally {
      setLoading(false)
    }
  }

  const acceptCall = async () => {
    if (!incomingCall) return

    const callSocket = socketManager.current.getSocket('call', userId)
    if (!callSocket) {
      setConnectionErrors(prev => [...prev, 'Call service not connected'])
      return
    }

    try {
      // Request media permissions before accepting the call
      const mediaConstraints = {
        audio: true,
        video: incomingCall.callType === 'VIDEO'
      }
      
      console.log('🔥 AGORA FRONTEND: Requesting media permissions:', mediaConstraints)
      await navigator.mediaDevices.getUserMedia(mediaConstraints)
      console.log('🔥 AGORA FRONTEND: Media permissions granted')
      
      // Emit accept call event via socket
      callSocket.emit('call:accept', { callId: incomingCall.callId })
      
      // Set up call config
      setCallConfig({
        call: {
          id: incomingCall.callId,
          channelName: incomingCall.channelName,
        },
        callType: incomingCall.callType,
        estimatedDuration: 5
      })
      setIsInCall(true)
      setIncomingCall(null)
    } catch (error) {
      console.error('🔥 AGORA FRONTEND: Media permission denied:', error)
      setConnectionErrors(prev => [...prev, 'Media permission denied. Please allow camera/microphone access.'])
    }
  }

  const rejectCall = () => {
    if (!incomingCall) return

    const callSocket = socketManager.current.getSocket('call', userId)
    if (!callSocket) {
      setConnectionErrors(prev => [...prev, 'Call service not connected'])
      return
    }

    // Emit reject call event via socket
    callSocket.emit('call:reject', { callId: incomingCall.callId })
    setIncomingCall(null)
  }

  const handleCallEnd = (callData: any) => {
    const callSocket = socketManager.current.getSocket('call', userId)
    if (callSocket && callConfig) {
      callSocket.emit('call:end', { callId: callConfig.call.id })
    }
    
    setIsInCall(false)
    setCallConfig(null)
    setIncomingCall(null)
    console.log('Call ended:', callData)
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const clearError = (index: number) => {
    setConnectionErrors(prev => prev.filter((_, i) => i !== index))
  }

  // Don't render on server side
  if (!mounted) {
    return (
      <Card className="w-full max-w-4xl mx-auto p-6">
        <div className="flex items-center justify-center h-96">
          <div className="text-gray-500">Loading chat...</div>
        </div>
      </Card>
    )
  }

  // Show call interface if in call
  if (isInCall && callConfig) {
    return (
      <SimpleCall
        callId={callConfig.call.id}
        channelName={callConfig.call.channelName}
        callType={callConfig.callType}
        estimatedDuration={callConfig.estimatedDuration}
        callerId={userId}
        receiverId={selectedUser?.id || ''}
        isInitiator={true}
        onCallEnd={handleCallEnd}
      />
    )
  }

  return (
    <Card className="w-full max-w-4xl mx-auto p-6">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Agora Chat</h3>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <span className={`w-2 h-2 rounded-full ${chatSocketConnected ? 'bg-green-500' : 'bg-gray-400'}`}></span>
              <span className="text-xs text-gray-600">
                Chat: {chatSocketConnected ? 'Connected' : 'Connecting...'}
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <span className={`w-2 h-2 rounded-full ${callSocketConnected ? 'bg-green-500' : 'bg-gray-400'}`}></span>
              <span className="text-xs text-gray-600">
                Calls: {callSocketConnected ? 'Connected' : 'Connecting...'}
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <span className={`w-2 h-2 rounded-full ${rtmState.isConnected ? 'bg-green-500' : 'bg-gray-400'}`}></span>
              <span className="text-xs text-gray-600">
                RTM: {rtmState.isConnected ? 'Connected' : 'Backup'}
              </span>
            </div>
          </div>
        </div>

        {/* Connection Errors */}
        {connectionErrors.length > 0 && (
          <div className="space-y-2">
            {connectionErrors.map((error, index) => (
              <div key={index} className="bg-yellow-50 border border-yellow-200 text-yellow-700 px-4 py-3 rounded flex items-center justify-between">
                <div className="flex items-center">
                  <span className="text-yellow-500 mr-2">⚠️</span>
                  <span className="text-sm">{error}</span>
                </div>
                <button
                  onClick={() => clearError(index)}
                  className="text-yellow-700 hover:text-yellow-900"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* User List */}
          <div className="space-y-2">
            <h4 className="font-medium text-gray-700">Available Users</h4>
            <div className="space-y-1">
              {availableUsers.map(user => (
                <div
                  key={user.id}
                  className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedUser?.id === user.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  onClick={() => setSelectedUser(user)}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">{user.displayName || user.username}</div>
                      <div className="text-xs text-gray-500">{user.role}</div>
                    </div>
                    <div className="flex items-center space-x-1">
                      <div className={`w-2 h-2 rounded-full ${
                        userOnlineStatus.get(user.id) ? 'bg-green-500' : 'bg-gray-400'
                      }`}></div>
                      <span className="text-xs text-gray-500">
                        {userOnlineStatus.get(user.id) ? 'Online' : 'Offline'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Chat Area */}
          <div className="md:col-span-2">
            {selectedUser ? (
              <div className="space-y-4">
                {/* Chat header with call buttons */}
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <h4 className="font-medium">{selectedUser.displayName || selectedUser.username}</h4>
                    <p className="text-sm text-gray-500">
                      {userOnlineStatus.get(selectedUser.id) ? 'Online' : 'Offline'}
                    </p>
                  </div>
                  <div className="flex space-x-2">
                    <Button
                      onClick={() => initiateCall('VOICE')}
                      disabled={loading || !callSocketConnected}
                      className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 text-sm disabled:opacity-50 flex items-center space-x-1"
                      title={!callSocketConnected ? 'Call service connecting...' : 'Start voice call'}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                      <span>Voice Call</span>
                    </Button>
                    <Button
                      onClick={() => initiateCall('VIDEO')}
                      disabled={loading || !callSocketConnected}
                      className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1 text-sm disabled:opacity-50 flex items-center space-x-1"
                      title={!callSocketConnected ? 'Call service connecting...' : 'Start video call'}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      <span>Video Call</span>
                    </Button>
                  </div>
                </div>

                {/* Messages */}
                <div className="h-64 overflow-y-auto border rounded-lg p-4 space-y-3">
                  {loading && <div className="text-center text-gray-500">Loading messages...</div>}
                  {messages.map(message => (
                    <div
                      key={message.id}
                      className={`flex ${message.isOwn ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-xs px-3 py-2 rounded-lg ${
                          message.isOwn
                            ? 'bg-blue-500 text-white'
                            : 'bg-gray-200 text-gray-800'
                        }`}
                      >
                        <p>{message.content}</p>
                        <p className="text-xs opacity-70 mt-1">
                          {new Date(message.createdAt).toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>

                {/* Message input */}
                <div className="flex space-x-2">
                  <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="Type a message..."
                    className="flex-1 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={loading}
                  />
                  <Button
                    onClick={sendMessage}
                    disabled={loading || !newMessage.trim() || (!chatSocketConnected && !rtmState.isConnected)}
                    className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
                    title={!chatSocketConnected && !rtmState.isConnected ? 'Chat service connecting...' : 'Send message'}
                  >
                    Send
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-64 text-gray-500">
                Select a user to start chatting
              </div>
            )}
          </div>
        </div>

        {/* Incoming Call Notification */}
        {incomingCall && incomingCall.initiator && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <Card className="p-6 max-w-md w-full mx-4 bg-white shadow-2xl">
              <div className="text-center space-y-6">
                <div className="w-20 h-20 mx-auto bg-blue-100 rounded-full flex items-center justify-center">
                  {incomingCall.callType === 'VOICE' ? (
                    <svg className="w-10 h-10 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                  ) : (
                    <svg className="w-10 h-10 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  )}
                </div>
                
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    Incoming {incomingCall.callType} Call
                  </h3>
                  <p className="text-gray-600">
                    {incomingCall.initiator?.displayName || incomingCall.initiator?.username || 'Unknown User'}
                  </p>
                </div>
                
                <div className="flex space-x-4">
                  <Button
                    onClick={rejectCall}
                    className="flex-1 bg-red-500 hover:bg-red-600 text-white"
                  >
                    Decline
                  </Button>
                  <Button
                    onClick={acceptCall}
                    className="flex-1 bg-green-500 hover:bg-green-600 text-white"
                  >
                    Accept
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>
    </Card>
  )
} 