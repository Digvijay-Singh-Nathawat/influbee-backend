import { useState, useEffect, useCallback, useRef } from 'react'
import { 
  IAgoraRTCClient,
  IAgoraRTCRemoteUser,
  ICameraVideoTrack,
  IMicrophoneAudioTrack,
  IRemoteVideoTrack,
  IRemoteAudioTrack,
  UID,
  ConnectionState
} from 'agora-rtc-sdk-ng'
import { agoraApi } from '@/lib/api'

// Dynamic imports for client-side only - fix SSR issues
let AgoraRTC: any = null
let AgoraRTM: any = null

interface User {
  uid: UID
  username: string
  isActive: boolean
}

interface CallState {
  isActive: boolean
  isInitiator: boolean
  participant: User | null
  duration: number
  cost: number
}

interface RTMState {
  client: any
  isConnected: boolean
  isConnecting: boolean
  connectionState: string
  onlineUsers: Set<string>
  userProfiles: Map<string, any>
}

interface UseAgoraReturn {
  // RTC
  rtcClient: IAgoraRTCClient | null
  localVideoTrack: ICameraVideoTrack | null
  localAudioTrack: IMicrophoneAudioTrack | null
  remoteUsers: IAgoraRTCRemoteUser[]
  connectionState: ConnectionState
  
  // RTM
  rtmClient: any
  rtmState: RTMState
  
  // Call management
  callState: CallState
  
  // Actions
  initializeRTC: (appId: string) => Promise<void>
  initializeRTM: (userId: string) => Promise<void>
  joinChannel: (channel: string, token: string, uid: UID) => Promise<void>
  leaveChannel: () => Promise<void>
  createLocalTracks: (callType?: 'VOICE' | 'VIDEO') => Promise<void>
  destroyLocalTracks: () => Promise<void>
  publishTracks: () => Promise<void>
  sendMessage: (peerId: string, message: any) => Promise<void>
  
  // User management
  getUserOnlineStatus: (userId: string) => boolean
  getUserProfile: (userId: string) => any
  
  // Cleanup
  cleanup: () => Promise<void>
}

// Global RTM management to prevent multiple instances
class RTMManager {
  private static instance: RTMManager
  private rtmClient: any = null
  private currentUserId: string | null = null
  private isInitializing: boolean = false
  private initializationPromise: Promise<any> | null = null
  private subscribers: Set<Function> = new Set()
  
  private constructor() {}
  
  static getInstance(): RTMManager {
    if (!RTMManager.instance) {
      RTMManager.instance = new RTMManager()
    }
    return RTMManager.instance
  }
  
  async getOrCreateClient(userId: string, appId: string, token: string): Promise<any> {
    // If same user and client exists, return existing
    if (this.rtmClient && this.currentUserId === userId) {
      console.log('🔥 AGORA FRONTEND: Using existing RTM client for user:', userId)
      return this.rtmClient
    }
    
    // If different user, cleanup existing client
    if (this.rtmClient && this.currentUserId !== userId) {
      console.log('🔥 AGORA FRONTEND: Cleaning up RTM client for different user:', this.currentUserId)
      await this.cleanup()
    }
    
    // If currently initializing, wait for it to complete
    if (this.isInitializing && this.initializationPromise) {
      console.log('🔥 AGORA FRONTEND: Waiting for RTM initialization to complete...')
      return await this.initializationPromise
    }
    
    // Initialize new client
    this.isInitializing = true
    this.initializationPromise = this.createNewClient(userId, appId, token)
    
    try {
      const client = await this.initializationPromise
      this.rtmClient = client
      this.currentUserId = userId
      console.log('🔥 AGORA FRONTEND: ✅ RTM client initialized successfully for user:', userId)
      return client
    } catch (error) {
      console.error('🔥 AGORA FRONTEND: ❌ Failed to initialize RTM client:', error)
      throw error
    } finally {
      this.isInitializing = false
      this.initializationPromise = null
    }
  }
  
  private async createNewClient(userId: string, appId: string, token: string): Promise<any> {
    if (!AgoraRTM) {
      throw new Error('AgoraRTM SDK not loaded')
    }
    
    console.log('🔥 AGORA FRONTEND: Creating new RTM client for user:', userId)
    
    const client = AgoraRTM.createInstance(appId, {
      enableLogUpload: false
    })
    
    // Set up connection state handler
    client.on('ConnectionStateChanged', (newState: string, reason: string) => {
      console.log('🔥 AGORA FRONTEND: RTM connection state changed:', { newState, reason })
      this.notifySubscribers({ type: 'CONNECTION_STATE_CHANGED', newState, reason })
    })
    
    // Set up message handler
    client.on('MessageFromPeer', (message: any, peerId: string) => {
      console.log('🔥 AGORA FRONTEND: Message from peer:', peerId, message)
      this.notifySubscribers({ type: 'MESSAGE_FROM_PEER', message, peerId })
    })
    
    // Login to RTM
    console.log('🔥 AGORA FRONTEND: Logging into RTM with userId:', userId)
    await client.login({ uid: userId, token })
    console.log('🔥 AGORA FRONTEND: ✅ RTM login successful')
    
    return client
  }
  
  subscribe(callback: Function): () => void {
    this.subscribers.add(callback)
    return () => {
      this.subscribers.delete(callback)
    }
  }
  
  private notifySubscribers(event: any) {
    this.subscribers.forEach(callback => {
      try {
        callback(event)
      } catch (error) {
        console.error('Error in RTM subscriber:', error)
      }
    })
  }
  
  async cleanup() {
    if (this.rtmClient) {
      try {
        console.log('🔥 AGORA FRONTEND: Cleaning up RTM client for user:', this.currentUserId)
        await this.rtmClient.logout()
        this.rtmClient = null
        this.currentUserId = null
        console.log('🔥 AGORA FRONTEND: ✅ RTM client cleaned up successfully')
      } catch (error) {
        console.warn('🔥 AGORA FRONTEND: ⚠️ Error cleaning up RTM client:', error)
      }
    }
  }
  
  getCurrentUserId(): string | null {
    return this.currentUserId
  }
  
  isConnected(): boolean {
    return !!this.rtmClient && !!this.currentUserId
  }
}

export function useAgora(): UseAgoraReturn {
  // Track mounting state to prevent SSR issues
  const [mounted, setMounted] = useState(false)
  
  // RTC State
  const [rtcClient, setRtcClient] = useState<IAgoraRTCClient | null>(null)
  const [localVideoTrack, setLocalVideoTrack] = useState<ICameraVideoTrack | null>(null)
  const [localAudioTrack, setLocalAudioTrack] = useState<IMicrophoneAudioTrack | null>(null)
  const [remoteUsers, setRemoteUsers] = useState<IAgoraRTCRemoteUser[]>([])
  const [connectionState, setConnectionState] = useState<ConnectionState>('DISCONNECTED')
  
  // RTM State
  const [rtmState, setRtmState] = useState<RTMState>({
    client: null,
    isConnected: false,
    isConnecting: false,
    connectionState: 'DISCONNECTED',
    onlineUsers: new Set(),
    userProfiles: new Map()
  })
  
  // Call State
  const [callState, setCallState] = useState<CallState>({
    isActive: false,
    isInitiator: false,
    participant: null,
    duration: 0,
    cost: 0
  })
  
  // Refs
  const rtmManager = useRef<RTMManager>(RTMManager.getInstance())
  const rtmSubscriptionRef = useRef<(() => void) | null>(null)
  
  // Handle client-side mounting
  useEffect(() => {
    setMounted(true)
    return () => {
      setMounted(false)
    }
  }, [])

  // Dynamic SDK loading function
  const loadSDKs = useCallback(async () => {
    if (typeof window === 'undefined') return

    try {
      if (!AgoraRTC) {
        const AgoraRTCModule = await import('agora-rtc-sdk-ng')
        AgoraRTC = AgoraRTCModule.default
        console.log('🔥 AGORA FRONTEND: RTC SDK loaded successfully')
      }
      
      if (!AgoraRTM) {
        const AgoraRTMModule = await import('agora-rtm-sdk')
        AgoraRTM = AgoraRTMModule.default || AgoraRTMModule
        console.log('🔥 AGORA FRONTEND: RTM SDK loaded successfully')
      }
    } catch (error) {
      console.error('🔥 AGORA FRONTEND: Failed to load SDKs:', error)
      throw error
    }
  }, [])

  // Initialize RTC using only Agora SDK
  const initializeRTC = useCallback(async (appId: string) => {
    if (!mounted || typeof window === 'undefined') return
    
    try {
      if (rtcClient) {
        console.log('🔥 AGORA FRONTEND: RTC client already initialized')
        return
      }

      // Load RTC SDK if not already loaded
      await loadSDKs()
      
      if (!AgoraRTC) {
        throw new Error('Failed to load Agora RTC SDK')
      }

      console.log('🔥 AGORA FRONTEND: Creating Agora RTC client with appId:', appId)
      const client = AgoraRTC.createClient({ 
        mode: 'rtc', 
        codec: 'vp8'
      })
      
      // Essential event handlers for Agora RTC
      client.on('user-published', async (user: IAgoraRTCRemoteUser, mediaType: 'video' | 'audio') => {
        console.log('🔥 AGORA FRONTEND: User published:', user.uid, mediaType)
        
        // Subscribe to the remote user
        await client.subscribe(user, mediaType)
        console.log('🔥 AGORA FRONTEND: Subscribed to user:', user.uid, mediaType)
        
        // For audio, play it immediately
        if (mediaType === 'audio' && user.audioTrack) {
          console.log('🔥 AGORA FRONTEND: Playing remote audio track for user:', user.uid)
          user.audioTrack.play()
        }
        
        setRemoteUsers(prev => {
          const existing = prev.find(u => u.uid === user.uid)
          if (existing) {
            return prev.map(u => u.uid === user.uid ? user : u)
          }
          return [...prev, user]
        })
      })
      
      client.on('user-unpublished', (user: IAgoraRTCRemoteUser) => {
        console.log('🔥 AGORA FRONTEND: User unpublished:', user.uid)
        setRemoteUsers(prev => prev.filter(u => u.uid !== user.uid))
      })
      
      client.on('user-left', (user: IAgoraRTCRemoteUser) => {
        console.log('🔥 AGORA FRONTEND: User left:', user.uid)
        setRemoteUsers(prev => prev.filter(u => u.uid !== user.uid))
      })
      
      client.on('connection-state-change', (state: ConnectionState) => {
        console.log('🔥 AGORA FRONTEND: RTC connection state changed:', state)
        setConnectionState(state)
      })
      
      setRtcClient(client)
      console.log('🔥 AGORA FRONTEND: ✅ Agora RTC client initialized successfully')
    } catch (error) {
      console.error('🔥 AGORA FRONTEND: ❌ Failed to initialize RTC client:', error)
      throw error
    }
  }, [mounted, rtcClient, loadSDKs])

  // Initialize RTM with proper singleton management
  const initializeRTM = useCallback(async (userId: string) => {
    if (!mounted || typeof window === 'undefined') return
    
    try {
      setRtmState(prev => ({ ...prev, isConnecting: true }))
      
      // Load RTM SDK if not already loaded
      await loadSDKs()
      
      if (!AgoraRTM) {
        throw new Error('Failed to load Agora RTM SDK')
      }
      
      console.log('🔥 AGORA FRONTEND: Starting RTM initialization for user:', userId)
      
      // Get RTM credentials from server
      const credentialsResponse = await agoraApi.getUserCredentials()
      if (!credentialsResponse.data.success) {
        throw new Error('Failed to get RTM credentials')
      }

      const { appId, chatToken } = credentialsResponse.data.data
      console.log('🔥 AGORA FRONTEND: Got RTM credentials:', {
        appId,
        hasToken: !!chatToken,
        tokenLength: chatToken?.length || 0
      })
      
      // Subscribe to RTM events before getting client
      if (rtmSubscriptionRef.current) {
        rtmSubscriptionRef.current()
      }
      
      rtmSubscriptionRef.current = rtmManager.current.subscribe((event: any) => {
        if (!mounted) return
        
        if (event.type === 'CONNECTION_STATE_CHANGED') {
          setRtmState(prev => ({
            ...prev,
            connectionState: `${event.newState} ${event.reason}`,
            isConnected: event.newState === 'CONNECTED',
            isConnecting: event.newState === 'CONNECTING'
          }))
        } else if (event.type === 'MESSAGE_FROM_PEER') {
          try {
            const parsedMessage = JSON.parse(event.message.text)
            console.log('🔥 AGORA FRONTEND: Parsed message:', parsedMessage)
          } catch (error) {
            console.log('🔥 AGORA FRONTEND: Raw message:', event.message.text)
          }
        }
      })
      
      // Get or create RTM client
      const client = await rtmManager.current.getOrCreateClient(userId, appId, chatToken)
      
      setRtmState(prev => ({
        ...prev,
        client,
        isConnected: true,
        isConnecting: false,
        connectionState: 'CONNECTED'
      }))
      
      console.log('🔥 AGORA FRONTEND: ✅ RTM client initialized successfully')
      
    } catch (error) {
      console.error('🔥 AGORA FRONTEND: ❌ Failed to initialize RTM client:', error)
      setRtmState(prev => ({
        ...prev,
        connectionState: 'FAILED',
        isConnected: false,
        isConnecting: false
      }))
      throw error
    }
  }, [mounted, loadSDKs])

  // Join channel - now properly gets token from backend
  const joinChannel = useCallback(async (channel: string, token: string, uid: UID) => {
    if (!rtcClient || !mounted) return
    
    try {
      let finalToken = token;
      
      // If no token provided, get it from backend
      if (!token) {
        console.log('🔥 AGORA FRONTEND: No token provided, requesting from backend...');
        const tokenResponse = await agoraApi.getRtcToken({
          channelName: channel,
          role: 'publisher'
        });
        
        if (tokenResponse.data.success) {
          finalToken = tokenResponse.data.data.token;
          console.log('🔥 AGORA FRONTEND: Got RTC token from backend:', {
            tokenLength: finalToken.length,
            tokenPrefix: finalToken.substring(0, 20) + '...'
          });
        } else {
          throw new Error('Failed to get RTC token from backend');
        }
      }
      
      const appId = process.env.NEXT_PUBLIC_AGORA_APP_ID || '';
      console.log('🔥 AGORA FRONTEND: Joining RTC channel:', {
        appId,
        channel,
        uid,
        hasToken: !!finalToken
      });
      
      await rtcClient.join(appId, channel, finalToken, uid);
      console.log('🔥 AGORA FRONTEND: ✅ Successfully joined RTC channel:', channel);
    } catch (error) {
      console.error('🔥 AGORA FRONTEND: ❌ Failed to join channel:', error);
      throw error;
    }
  }, [rtcClient, mounted])

  // Leave channel
  const leaveChannel = useCallback(async () => {
    if (!rtcClient || !mounted) return
    
    try {
      await rtcClient.leave()
      console.log('🔥 AGORA FRONTEND: Left RTC channel successfully')
    } catch (error) {
      console.error('🔥 AGORA FRONTEND: Failed to leave channel:', error)
    }
  }, [rtcClient, mounted])

  // Create local tracks using only Agora SDK
  const createLocalTracks = useCallback(async (callType: 'VOICE' | 'VIDEO' = 'VIDEO') => {
    if (!mounted || typeof window === 'undefined') return
    
    try {
      // First, ensure we have loaded the SDK
      if (!AgoraRTC) {
        await loadSDKs()
      }
      
      console.log('🔥 AGORA FRONTEND: Requesting media permissions for', callType, 'call')
      
      if (callType === 'VIDEO') {
        console.log('🔥 AGORA FRONTEND: Creating video and audio tracks using Agora SDK')
        // Use Agora SDK to create both video and audio tracks
        const [videoTrack, audioTrack] = await AgoraRTC.createMicrophoneAndCameraTracks(
          {
            // Audio configuration
            echoCancellation: true,
            noiseSuppression: true,
            AGC: true,
          },
          {
            // Video configuration
            optimizationMode: 'balanced',
            encoderConfig: {
              width: 640,
              height: 480,
              frameRate: 15,
              bitrateMin: 200,
              bitrateMax: 1000,
            },
          }
        )
        
        setLocalVideoTrack(videoTrack)
        setLocalAudioTrack(audioTrack)
        console.log('🔥 AGORA FRONTEND: ✅ Video and audio tracks created successfully')
      } else {
        console.log('🔥 AGORA FRONTEND: Creating audio track only using Agora SDK')
        // Use Agora SDK to create audio track only
        const audioTrack = await AgoraRTC.createMicrophoneAudioTrack({
          echoCancellation: true,
          noiseSuppression: true,
          AGC: true,
        })
        
        setLocalAudioTrack(audioTrack)
        console.log('🔥 AGORA FRONTEND: ✅ Audio track created successfully')
      }
    } catch (error: any) {
      console.error('🔥 AGORA FRONTEND: ❌ Failed to create local tracks:', error)
      
      // Handle specific permission errors
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        console.error('🔥 AGORA FRONTEND: ❌ User denied media permissions')
        throw new Error('Media permissions denied. Please allow microphone and camera access and try again.')
      } else if (error.name === 'NotFoundError') {
        console.error('🔥 AGORA FRONTEND: ❌ No media devices found')
        throw new Error('No microphone or camera found. Please check your devices.')
      } else if (error.name === 'NotReadableError') {
        console.error('🔥 AGORA FRONTEND: ❌ Media devices are busy')
        throw new Error('Microphone or camera is busy. Please close other applications and try again.')
      } else {
        console.error('🔥 AGORA FRONTEND: ❌ Unknown error:', error.message)
        throw new Error(`Failed to access media devices: ${error.message}`)
      }
    }
  }, [mounted, loadSDKs])

  // Destroy local tracks
  const destroyLocalTracks = useCallback(async () => {
    if (!mounted) return
    
    try {
      if (localVideoTrack) {
        localVideoTrack.close()
        setLocalVideoTrack(null)
        console.log('🔥 AGORA FRONTEND: Local video track destroyed')
      }
      
      if (localAudioTrack) {
        localAudioTrack.close()
        setLocalAudioTrack(null)
        console.log('🔥 AGORA FRONTEND: Local audio track destroyed')
      }
      
      console.log('🔥 AGORA FRONTEND: Local tracks destroyed')
    } catch (error) {
      console.error('🔥 AGORA FRONTEND: Failed to destroy local tracks:', error)
    }
  }, [localVideoTrack, localAudioTrack, mounted])

  // Publish local tracks using only Agora SDK
  const publishTracks = useCallback(async () => {
    if (!rtcClient || !mounted || typeof window === 'undefined') return
    
    try {
      const tracksToPublish = []
      
      if (localAudioTrack) {
        tracksToPublish.push(localAudioTrack)
        console.log('🔥 AGORA FRONTEND: Publishing audio track');
      }
      
      if (localVideoTrack) {
        tracksToPublish.push(localVideoTrack)
        console.log('🔥 AGORA FRONTEND: Publishing video track');
      }
      
      if (tracksToPublish.length > 0) {
        await rtcClient.publish(tracksToPublish)
        console.log('🔥 AGORA FRONTEND: ✅ Successfully published', tracksToPublish.length, 'tracks');
        
        // Additional verification for video track
        if (localVideoTrack) {
          console.log('🔥 AGORA FRONTEND: Video track details:', {
            enabled: localVideoTrack.enabled,
            muted: localVideoTrack.muted,
            mediaStreamTrack: !!localVideoTrack.getMediaStreamTrack(),
            trackId: localVideoTrack.getTrackId()
          });
        }
        
        // Additional verification for audio track
        if (localAudioTrack) {
          console.log('🔥 AGORA FRONTEND: Audio track details:', {
            enabled: localAudioTrack.enabled,
            muted: localAudioTrack.muted,
            mediaStreamTrack: !!localAudioTrack.getMediaStreamTrack(),
            trackId: localAudioTrack.getTrackId()
          });
        }
      } else {
        console.log('🔥 AGORA FRONTEND: ⚠️ No tracks to publish - tracks may still be loading');
      }
    } catch (error: any) {
      console.error('🔥 AGORA FRONTEND: ❌ Failed to publish tracks:', error)
      
      // Handle specific publish errors
      if (error.code === 'INVALID_OPERATION') {
        console.error('🔥 AGORA FRONTEND: ❌ Invalid operation - may not be connected to channel');
        throw new Error('Cannot publish tracks - not connected to channel');
      } else if (error.code === 'INVALID_PARAMS') {
        console.error('🔥 AGORA FRONTEND: ❌ Invalid tracks provided');
        throw new Error('Invalid tracks provided for publishing');
      } else {
        console.error('🔥 AGORA FRONTEND: ❌ Unknown publish error:', error.message);
        throw new Error(`Failed to publish tracks: ${error.message}`);
      }
    }
  }, [rtcClient, localAudioTrack, localVideoTrack, mounted])

  // Send RTM message
  const sendMessage = useCallback(async (peerId: string, message: any) => {
    const client = rtmState.client
    if (!client || !mounted) return
    
    try {
      await client.sendMessageToPeer(
        { text: typeof message === 'string' ? message : JSON.stringify(message) },
        peerId
      )
      console.log('🔥 AGORA FRONTEND: RTM message sent to:', peerId)
    } catch (error) {
      console.error('🔥 AGORA FRONTEND: Failed to send RTM message:', error)
    }
  }, [rtmState.client, mounted])

  // Get user online status
  const getUserOnlineStatus = useCallback((userId: string): boolean => {
    return rtmState.onlineUsers.has(userId)
  }, [rtmState.onlineUsers])

  // Get user profile
  const getUserProfile = useCallback((userId: string): any => {
    return rtmState.userProfiles.get(userId)
  }, [rtmState.userProfiles])

  // Cleanup
  const cleanup = useCallback(async () => {
    if (!mounted) return
    
    try {
      // Cleanup local tracks
      await destroyLocalTracks()
      
      // Leave RTC channel
      if (rtcClient) {
        await rtcClient.leave()
        setRtcClient(null)
        console.log('🔥 AGORA FRONTEND: RTC client cleaned up')
      }
      
      // Cleanup RTM subscription
      if (rtmSubscriptionRef.current) {
        rtmSubscriptionRef.current()
        rtmSubscriptionRef.current = null
      }
      
      // Reset RTM state
      setRtmState(prev => ({
        ...prev,
        client: null,
        isConnected: false,
        connectionState: 'DISCONNECTED'
      }))
      
      console.log('🔥 AGORA FRONTEND: Agora cleanup completed')
    } catch (error) {
      console.error('🔥 AGORA FRONTEND: Error during cleanup:', error)
    }
  }, [mounted, rtcClient, destroyLocalTracks])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup()
    }
  }, [cleanup])

  return {
    // RTC
    rtcClient,
    localVideoTrack,
    localAudioTrack,
    remoteUsers,
    connectionState,
    
    // RTM
    rtmClient: rtmState.client,
    rtmState,
    
    // Call management
    callState,
    
    // Actions
    initializeRTC,
    initializeRTM,
    joinChannel,
    leaveChannel,
    createLocalTracks,
    destroyLocalTracks,
    publishTracks,
    sendMessage,
    
    // User management
    getUserOnlineStatus,
    getUserProfile,
    
    // Cleanup
    cleanup,
  }
} 