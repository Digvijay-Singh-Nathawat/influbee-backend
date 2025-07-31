'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { callApi } from '@/lib/api'
import { useAuthStore } from '@/lib/store/auth'
import AgoraDebugger from '@/utils/agora-debug'

// Dynamic imports for client-side only
let AgoraRTC: any = null

interface SimpleCallProps {
  callId: string
  channelName: string
  callType: 'VOICE' | 'VIDEO'
  estimatedDuration: number
  callerId: string
  receiverId: string
  isInitiator: boolean
  onCallEnd: (callData: any) => void
}

export default function SimpleCall({
  callId,
  channelName,
  callType,
  estimatedDuration,
  callerId,
  receiverId,
  isInitiator,
  onCallEnd
}: SimpleCallProps) {
  const { user } = useAuthStore()
  const [isCallActive, setIsCallActive] = useState(false)
  const [callStartTime, setCallStartTime] = useState<number | null>(null)
  const [callDuration, setCallDuration] = useState(0)
  const [mounted, setMounted] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting')
  const [error, setError] = useState<string | null>(null)
  const [audioEnabled, setAudioEnabled] = useState(true)
  const [videoEnabled, setVideoEnabled] = useState(callType === 'VIDEO')
  const [participantCount, setParticipantCount] = useState(1)
  const [remoteUsers, setRemoteUsers] = useState<any[]>([])

  // Refs for video containers and Agora objects
  const localVideoRef = useRef<HTMLDivElement>(null)
  const remoteVideoRef = useRef<HTMLDivElement>(null)
  const rtcClientRef = useRef<any>(null)
  const localVideoTrackRef = useRef<any>(null)
  const localAudioTrackRef = useRef<any>(null)
  const cleanupRef = useRef<boolean>(false) // Track cleanup state
  const callStartedRef = useRef<boolean>(false) // Prevent multiple starts
  const lastTokenRequestRef = useRef<number>(0) // Rate limiting for token requests

  // Handle client-side mounting
  useEffect(() => {
    setMounted(true)
    return () => {
      setMounted(false)
    }
  }, [])

  // Dynamic import and SDK initialization
  const loadAgoraSDK = useCallback(async () => {
    try {
      const AgoraRTC = (await import('agora-rtc-sdk-ng')).default
      
      // Disable statistics collection to avoid ERR_BLOCKED_BY_CLIENT errors
      AgoraRTC.setLogLevel(0) // Reduce log verbosity
      
      return AgoraRTC
    } catch (error) {
      console.error('Failed to load Agora SDK:', error)
      throw new Error('Failed to load Agora SDK')
    }
  }, [])

  // Get RTC token from backend with rate limiting
  const getRTCToken = useCallback(async () => {
    try {
      // Rate limiting: prevent requests within 1 second
      const now = Date.now()
      if (now - lastTokenRequestRef.current < 1000) {
        console.log('🔥 AGORA: Rate limiting token request')
        await new Promise(resolve => setTimeout(resolve, 1000 - (now - lastTokenRequestRef.current)))
      }
      lastTokenRequestRef.current = Date.now()
      
      const authToken = localStorage.getItem('token')
      console.log('🔥 AGORA: Token request debug:', {
        authToken: authToken ? `${authToken.substring(0, 20)}...` : 'NOT_FOUND',
        channelName,
        url: 'http://localhost:3001/api/agora/token/rtc'
      })

      const response = await fetch('http://localhost:3001/api/agora/token/rtc', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          channelName,
          role: 'publisher'
        })
      })

      console.log('🔥 AGORA: Token response debug:', {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries())
      })
      
      const data = await response.json()
      console.log('🔥 AGORA: Token response data:', data)
      
      if (data.success) {
        console.log('🔥 AGORA: Token successfully obtained:', {
          hasToken: !!data.data.token,
          tokenLength: data.data.token?.length,
          appId: data.data.appId,
          uid: data.data.uid,
          channelName: data.data.channelName,
          expirationInSeconds: data.data.expirationInSeconds
        })
        return data.data // Return the full data object with token and appId
      }
      throw new Error(`Failed to get RTC token: ${data.message || 'Unknown error'}`)
    } catch (error) {
      console.error('🔥 AGORA: Failed to get RTC token:', error)
      throw error
    }
  }, [channelName])

  // Initialize and start call
  useEffect(() => {
    if (!mounted || callStartedRef.current) return

    console.log('🔥 AGORA: Starting call initialization from useEffect...')
    callStartedRef.current = true

    let cleanup = false
    cleanupRef.current = false

    const startCall = async () => {
      try {
        setConnectionStatus('connecting')
        setError(null)
        
        console.log('🔥 AGORA: Starting call initialization...')
        
        // Load Agora SDK
        const SDK = await loadAgoraSDK()
        if (cleanup || cleanupRef.current) return
        
        // Create RTC client
        const client = SDK.createClient({ 
          mode: 'rtc', 
          codec: 'vp8',
          // Disable statistics collection to avoid ERR_BLOCKED_BY_CLIENT errors
          reportStats: false
        })
        rtcClientRef.current = client
        console.log('🔥 AGORA: RTC client created')
        
        // Set up error handling to reduce console noise
        client.on('exception', (event: any) => {
          // Only log critical errors, ignore stats collection errors
          if (event.code !== 'STATS_COLLECTION_FAILED' && event.code !== 'NETWORK_ERROR') {
            console.warn('🔥 AGORA: Client exception:', event)
          }
        })
        
        // Set up event listeners
        client.on('user-published', async (user: any, mediaType: 'video' | 'audio') => {
          console.log('🔥 AGORA: User published:', user.uid, mediaType)
          
          try {
            await client.subscribe(user, mediaType)
            console.log('🔥 AGORA: Subscribed to user:', user.uid, mediaType)
            
            if (mediaType === 'audio' && user.audioTrack) {
              user.audioTrack.play()
              console.log('🔥 AGORA: Remote audio track playing')
            }
            
            if (mediaType === 'video' && user.videoTrack && remoteVideoRef.current) {
              user.videoTrack.play(remoteVideoRef.current)
              console.log('🔥 AGORA: Remote video track playing')
            }
            
            setRemoteUsers(prev => {
              const existing = prev.find(u => u.uid === user.uid)
              if (existing) {
                return prev.map(u => u.uid === user.uid ? user : u)
              }
              return [...prev, user]
            })
          } catch (error: any) {
            // Filter out non-critical errors to reduce console noise
            if (!error.message?.includes('STATS_COLLECTION') && 
                !error.message?.includes('ERR_BLOCKED_BY_CLIENT') &&
                !error.message?.includes('Failed to fetch')) {
              console.warn('🔥 AGORA: Subscription error:', error.message)
            }
          }
        })
        
        client.on('user-unpublished', (user: any) => {
          console.log('🔥 AGORA: User unpublished:', user.uid)
          setRemoteUsers(prev => prev.filter(u => u.uid !== user.uid))
        })
        
        client.on('user-left', (user: any) => {
          console.log('🔥 AGORA: User left:', user.uid)
          setRemoteUsers(prev => prev.filter(u => u.uid !== user.uid))
        })
        
        // Add connection state monitoring
        client.on('connection-state-change', (curState: string, revState: string) => {
          console.log('🔥 AGORA: Connection state change:', curState, 'from', revState)
          if (curState === 'CONNECTED') {
            setConnectionStatus('connected')
          } else if (curState === 'CONNECTING') {
            setConnectionStatus('connecting')
          } else if (curState === 'DISCONNECTED') {
            setConnectionStatus('disconnected')
          }
        })
        
        if (cleanup || cleanupRef.current) return

        // Create local tracks
        console.log('🔥 AGORA: Creating local tracks for', callType, 'call')
        
        if (callType === 'VIDEO') {
          const [videoTrack, audioTrack] = await SDK.createMicrophoneAndCameraTracks(
            {
              echoCancellation: true,
              noiseSuppression: true,
              AGC: true,
            },
            {
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
          
          localVideoTrackRef.current = videoTrack
          localAudioTrackRef.current = audioTrack
          
          // Play local video immediately
          if (localVideoRef.current && videoTrack) {
            videoTrack.play(localVideoRef.current)
            console.log('🔥 AGORA: Local video track playing')
          }
          
          console.log('🔥 AGORA: Video and audio tracks created successfully')
        } else {
          const audioTrack = await SDK.createMicrophoneAudioTrack({
            echoCancellation: true,
            noiseSuppression: true,
            AGC: true,
          })
          
          localAudioTrackRef.current = audioTrack
          console.log('🔥 AGORA: Audio track created successfully')
        }
        
        if (cleanup || cleanupRef.current) return

        // Get RTC token and app ID from backend
        const tokenData = await getRTCToken()
        if (cleanup || cleanupRef.current) return
        
        // Join channel using appId, token, and UID from backend
        const { token, appId, uid } = tokenData
        
        console.log('🔥 AGORA: Joining channel with full debug:', {
          appId,
          appIdType: typeof appId,
          appIdLength: appId?.length,
          channelName,
          channelNameType: typeof channelName,
          channelNameLength: channelName?.length,
          token: token ? `${token.substring(0, 20)}...` : 'NULL',
          tokenType: typeof token,
          tokenLength: token?.length,
          uid,
          uidType: typeof uid,
          timestamp: new Date().toISOString()
        })
        
        // Add retry logic for UID conflicts
        let joinAttempts = 0
        const maxAttempts = 3
        
        while (joinAttempts < maxAttempts) {
          try {
            await client.join(appId, channelName, token, uid)
            console.log('🔥 AGORA: ✅ Successfully joined channel on attempt', joinAttempts + 1)
            break
          } catch (error: any) {
            joinAttempts++
            console.log(`🔥 AGORA: Join attempt ${joinAttempts} failed:`, error.message)
            
            if (error.message?.includes('UID_CONFLICT')) {
              console.log('🔥 AGORA: UID conflict detected, cleaning up and retrying...')
              
              // Force leave any existing session
              try {
                await client.leave()
                console.log('🔥 AGORA: Forced leave successful')
              } catch (leaveError) {
                console.log('🔥 AGORA: Force leave failed (expected):', leaveError)
              }
              
              // Wait before retry
              await new Promise(resolve => setTimeout(resolve, 1000 * joinAttempts))
              
              if (joinAttempts < maxAttempts) {
                console.log(`🔥 AGORA: Retrying join (attempt ${joinAttempts + 1}/${maxAttempts})...`)
                continue
              }
            }
            
            throw error
          }
        }
        
        if (cleanup || cleanupRef.current) return

        // Publish tracks
        const tracksToPublish = []
        if (localAudioTrackRef.current) {
          tracksToPublish.push(localAudioTrackRef.current)
        }
        if (localVideoTrackRef.current) {
          tracksToPublish.push(localVideoTrackRef.current)
        }
        
        if (tracksToPublish.length > 0) {
          await client.publish(tracksToPublish)
          console.log('🔥 AGORA: ✅ Successfully published', tracksToPublish.length, 'tracks')
        }
        
        if (cleanup || cleanupRef.current) return

        setIsCallActive(true)
        setCallStartTime(Date.now())
        setConnectionStatus('connected')
        
        // Notify backend (with better error handling)
        try {
          const startResponse = await callApi.start({ callId })
          console.log('🔥 AGORA: ✅ Backend notified of call start')
        } catch (err: any) {
          console.warn('🔥 AGORA: ⚠️ Failed to notify backend:', err.message)
          // Continue with call even if backend notification fails
        }
        
      } catch (error: any) {
        if (cleanup || cleanupRef.current) return
        
        console.error('🔥 AGORA: ❌ Failed to start call:', error)
        
        let errorMessage = 'Failed to start call. Please try again.'
        
        // Handle specific error types
        if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
          errorMessage = 'Please allow microphone and camera access to start the call.'
        } else if (error.name === 'NotFoundError') {
          errorMessage = 'No microphone or camera found. Please check your devices.'
        } else if (error.name === 'NotReadableError') {
          errorMessage = 'Microphone or camera is busy. Please close other applications and try again.'
        } else if (error.message?.includes('ERR_BLOCKED_BY_CLIENT')) {
          // Ignore blocked by client errors (likely ad blockers)
          return
        } else if (error.message?.includes('Failed to fetch')) {
          errorMessage = 'Network connection issue. Please check your internet connection.'
        }
        
        setError(errorMessage)
        setConnectionStatus('disconnected')
        
        setTimeout(() => {
          onCallEnd({ error: errorMessage })
        }, 3000)
      }
    }

    startCall()

    return () => {
      cleanup = true
      cleanupRef.current = true
    }
  }, [mounted, callId, channelName, callType]) // Removed unstable dependencies

  // Update participant count
  useEffect(() => {
    setParticipantCount(remoteUsers.length + 1)
  }, [remoteUsers])

  // Ensure local video is always playing
  useEffect(() => {
    if (localVideoTrackRef.current && localVideoRef.current && videoEnabled && callType === 'VIDEO') {
      try {
        // Clear any existing video in the local container first
        if (localVideoRef.current) {
          localVideoRef.current.innerHTML = ''
        }
        
        // Play the local video track
        localVideoTrackRef.current.play(localVideoRef.current)
        console.log('🔥 AGORA: Local video track re-attached')
      } catch (error) {
        console.warn('🔥 AGORA: Failed to re-attach local video:', error)
      }
    }
  }, [videoEnabled, callType, isCallActive])

  // Ensure remote video is properly assigned
  useEffect(() => {
    if (remoteUsers.length > 0 && remoteUsers[0]?.videoTrack && remoteVideoRef.current) {
      try {
        // Clear any existing video in the remote container first
        if (remoteVideoRef.current) {
          remoteVideoRef.current.innerHTML = ''
        }
        
        // Play the remote video track
        remoteUsers[0].videoTrack.play(remoteVideoRef.current)
        console.log('🔥 AGORA: Remote video track re-attached')
      } catch (error) {
        console.warn('🔥 AGORA: Failed to re-attach remote video:', error)
      }
    }
  }, [remoteUsers])

  // Handle call duration timer
  useEffect(() => {
    if (!isCallActive || !callStartTime) return

    const interval = setInterval(() => {
      const duration = Math.floor((Date.now() - callStartTime) / 1000)
      setCallDuration(duration)
    }, 1000)

    return () => clearInterval(interval)
  }, [isCallActive, callStartTime])

  // Handle call end
  const handleCallEnd = useCallback(async (reason: string) => {
    try {
      setIsCallActive(false)
      setConnectionStatus('disconnected')
      cleanupRef.current = true
      callStartedRef.current = false // Reset to allow remounting
      
      const finalDuration = callStartTime ? Math.floor((Date.now() - callStartTime) / 1000) : callDuration
      
      // Leave channel
      if (rtcClientRef.current) {
        await rtcClientRef.current.leave()
        rtcClientRef.current = null
        console.log('🔥 AGORA: Left channel')
      }
      
      // Close tracks
      if (localVideoTrackRef.current) {
        localVideoTrackRef.current.close()
        localVideoTrackRef.current = null
      }
      
      if (localAudioTrackRef.current) {
        localAudioTrackRef.current.close()
        localAudioTrackRef.current = null
      }
      
      console.log('🔥 AGORA: Tracks closed')
      
      // Notify backend
      try {
        const callEndResponse = await callApi.end({
          callId,
          actualDuration: finalDuration
        })
        
        onCallEnd({
          ...callEndResponse.data,
          reason,
          actualDuration: finalDuration
        })
      } catch (error: any) {
        console.warn('🔥 AGORA: Failed to notify backend of call end:', error.message)
        // Continue with call end even if backend notification fails
        // Filter out non-critical errors to reduce console noise
        if (!error.message?.includes('ERR_BLOCKED_BY_CLIENT') &&
            !error.message?.includes('Failed to fetch')) {
          console.warn('Backend notification failed:', error.message)
        }
        
        onCallEnd({
          reason,
          actualDuration: finalDuration,
          error: 'Failed to save call data'
        })
      }
      
    } catch (error: any) {
      console.error('🔥 AGORA: Failed to end call:', error)
      onCallEnd({ error: 'Failed to end call properly' })
    }
  }, [callId, callDuration, callStartTime, onCallEnd])

  // Format duration for display
  const formatDuration = useCallback((seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }, [])

  // Toggle audio
  const toggleAudio = useCallback(async () => {
    if (!localAudioTrackRef.current || !rtcClientRef.current) return
    
    try {
      if (audioEnabled) {
        await localAudioTrackRef.current.setEnabled(false)
        console.log('🔥 AGORA: Audio disabled')
      } else {
        await localAudioTrackRef.current.setEnabled(true)
        console.log('🔥 AGORA: Audio enabled')
      }
      setAudioEnabled(!audioEnabled)
    } catch (error) {
      console.error('🔥 AGORA: Failed to toggle audio:', error)
    }
  }, [audioEnabled])

  // Toggle video
  const toggleVideo = useCallback(async () => {
    if (!localVideoTrackRef.current || !rtcClientRef.current) return
    
    try {
      if (videoEnabled) {
        await localVideoTrackRef.current.setEnabled(false)
        console.log('🔥 AGORA: Video disabled')
      } else {
        await localVideoTrackRef.current.setEnabled(true)
        // Ensure video is still playing locally
        if (localVideoRef.current) {
          localVideoTrackRef.current.play(localVideoRef.current)
          console.log('🔥 AGORA: Local video restarted')
        }
        console.log('🔥 AGORA: Video enabled')
      }
      setVideoEnabled(!videoEnabled)
    } catch (error) {
      console.error('🔥 AGORA: Failed to toggle video:', error)
    }
  }, [videoEnabled])

  // Debug function for video issues
  const debugVideoCall = useCallback(async () => {
    console.log('🔥 AGORA: Starting video call debug...')
    await AgoraDebugger.debugAll(
      rtcClientRef.current,
      localVideoTrackRef.current,
      remoteUsers,
      localVideoRef.current,
      remoteVideoRef.current
    )
  }, [remoteUsers])

  // Cleanup on component unmount
  useEffect(() => {
    return () => {
      console.log('🔥 AGORA: Component unmounting, cleaning up...')
      
      const cleanupAsync = async () => {
        try {
          cleanupRef.current = true
          callStartedRef.current = false // Reset to allow remounting
          
          // Force cleanup multiple times to ensure all resources are released
          for (let i = 0; i < 3; i++) {
            try {
              // Close tracks first
              if (localVideoTrackRef.current) {
                localVideoTrackRef.current.close()
                localVideoTrackRef.current = null
                console.log('🔥 AGORA: Video track closed')
              }
              
              if (localAudioTrackRef.current) {
                localAudioTrackRef.current.close()
                localAudioTrackRef.current = null
                console.log('🔥 AGORA: Audio track closed')
              }
              
              // Force leave channel to prevent UID conflicts
              if (rtcClientRef.current) {
                console.log('🔥 AGORA: Forcing leave to prevent UID conflicts...')
                await rtcClientRef.current.leave()
                rtcClientRef.current = null
                console.log('🔥 AGORA: Successfully left channel')
              }
              
              break // Exit loop if successful
            } catch (error) {
              console.log(`🔥 AGORA: Cleanup attempt ${i + 1} error (expected):`, error)
              if (i === 2) {
                // Final attempt - force null references
                localVideoTrackRef.current = null
                localAudioTrackRef.current = null
                rtcClientRef.current = null
              }
            }
          }
          
          console.log('🔥 AGORA: ✅ Component cleanup completed')
        } catch (error) {
          console.log('🔥 AGORA: Final cleanup error (expected):', error)
        }
      }
      
      cleanupAsync()
    }
  }, [])

  // Don't render anything until mounted (SSR safety)
  if (!mounted) {
    return (
      <Card className="w-full max-w-4xl mx-auto p-6">
        <div className="flex items-center justify-center h-96">
          <div className="text-gray-500">Loading call...</div>
        </div>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-4xl mx-auto p-6">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-800 flex items-center space-x-2">
              {callType === 'VOICE' ? (
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
              ) : (
                <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              )}
              <span>{callType === 'VOICE' ? 'Voice Call' : 'Video Call'}</span>
            </h2>
            <p className="text-gray-600">
              {connectionStatus === 'connecting' && 'Connecting...'}
              {connectionStatus === 'connected' && 'Connected'}
              {connectionStatus === 'disconnected' && 'Disconnected'}
            </p>
          </div>
          <div className="flex items-center space-x-2">
            {/* Audio toggle button */}
            <Button
              onClick={toggleAudio}
              className={`p-2 rounded-full ${
                audioEnabled 
                  ? 'bg-green-500 hover:bg-green-600' 
                  : 'bg-red-500 hover:bg-red-600'
              } text-white`}
            >
              {audioEnabled ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                </svg>
              )}
            </Button>
            
            {/* Video toggle button (only for video calls) */}
            {callType === 'VIDEO' && (
              <Button
                onClick={toggleVideo}
                className={`p-2 rounded-full ${
                  videoEnabled 
                    ? 'bg-blue-500 hover:bg-blue-600' 
                    : 'bg-gray-500 hover:bg-gray-600'
                } text-white`}
              >
                {videoEnabled ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636m12.728 12.728L18.364 5.636M5.636 18.364l12.728-12.728" />
                  </svg>
                )}
              </Button>
            )}
            
            <Button
              onClick={() => handleCallEnd('user')}
              className="bg-red-500 hover:bg-red-600 text-white px-6 py-3"
            >
              End Call
            </Button>
            
            {/* Debug button (only in development) */}
            {process.env.NODE_ENV === 'development' && (
              <Button
                onClick={debugVideoCall}
                className="bg-yellow-500 hover:bg-yellow-600 text-white px-4 py-2"
              >
                Debug Video
              </Button>
            )}
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
            <div className="flex items-center">
              <span className="text-red-500 mr-2">⚠️</span>
              <span>{error}</span>
            </div>
          </div>
        )}

        {/* Call Status */}
        <div className="bg-gray-50 rounded-lg p-6">
          <div className="grid grid-cols-2 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-gray-800">
                {formatDuration(callDuration)}
              </div>
              <div className="text-sm text-gray-600">Duration</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-800">
                {participantCount}
              </div>
              <div className="text-sm text-gray-600">Participants</div>
            </div>
          </div>
        </div>

        {/* Video Display (for video calls) */}
        {callType === 'VIDEO' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Local Video */}
            <div className="bg-gray-900 rounded-lg aspect-video relative overflow-hidden">
              <div 
                ref={localVideoRef}
                className="w-full h-full"
                style={{ objectFit: 'cover' }}
              />
              <div className="absolute bottom-2 left-2 text-white text-sm bg-black bg-opacity-50 px-2 py-1 rounded">
                You ({videoEnabled ? 'Video On' : 'Video Off'})
              </div>
              {!videoEnabled && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
                  <div className="text-white text-center">
                    <svg className="w-12 h-12 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636m12.728 12.728L18.364 5.636M5.636 18.364l12.728-12.728" />
                    </svg>
                    <p>Video Off</p>
                  </div>
                </div>
              )}
            </div>
            
            {/* Remote Video */}
            <div className="bg-gray-900 rounded-lg aspect-video relative overflow-hidden">
              <div 
                ref={remoteVideoRef}
                className="w-full h-full"
                style={{ objectFit: 'cover' }}
              />
              <div className="absolute bottom-2 left-2 text-white text-sm bg-black bg-opacity-50 px-2 py-1 rounded">
                {remoteUsers.length > 0 ? `Remote User (${remoteUsers[0]?.uid})` : 'Waiting...'}
              </div>
              {remoteUsers.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center text-white">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-2"></div>
                    <p>Waiting for other user...</p>
                    <p className="text-sm text-gray-300 mt-2">
                      Channel: {channelName}
                    </p>
                  </div>
                </div>
              )}
              {remoteUsers.length > 0 && remoteUsers[0]?.videoTrack && (
                <div className="absolute top-2 right-2 text-white text-xs bg-green-500 px-2 py-1 rounded">
                  Video Connected
                </div>
              )}
              {remoteUsers.length > 0 && !remoteUsers[0]?.videoTrack && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
                  <div className="text-white text-center">
                    <svg className="w-12 h-12 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636m12.728 12.728L18.364 5.636M5.636 18.364l12.728-12.728" />
                    </svg>
                    <p>Remote Video Off</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Audio Indicator (for voice calls) */}
        {callType === 'VOICE' && (
          <div className="bg-gray-50 rounded-lg p-6 text-center">
            <div className="text-6xl mb-4">📞</div>
            <div className="text-lg font-semibold text-gray-800 mb-2">Voice Call Active</div>
            <div className="text-sm text-gray-600 space-y-1">
              <div>
                Your Audio: {audioEnabled ? '🎤 On' : '🔇 Off'}
              </div>
              <div>
                Remote Users: {remoteUsers.length}
              </div>
              {remoteUsers.length > 0 && (
                <div>
                  Remote Audio: {remoteUsers.some(u => u.audioTrack) ? '🔊 Connected' : '🔇 No Audio'}
                </div>
              )}
            </div>
            <div className="text-xs text-gray-500 mt-2">
              Channel: {channelName}
            </div>
          </div>
        )}

        {/* Call Info */}
        <div className="bg-blue-50 rounded-lg p-4">
          <h3 className="font-semibold text-blue-800 mb-2">Call Information</h3>
          <div className="space-y-2 text-sm text-blue-700">
            <div>• Call managed by Agora Real-Time Communication</div>
            <div>• Type: {callType} Call</div>
            <div>• Status: {connectionStatus}</div>
            <div>• Participants: {participantCount}</div>
            <div>• Channel: {channelName}</div>
            <div>• Local Audio: {audioEnabled ? 'Enabled' : 'Disabled'}</div>
            {callType === 'VIDEO' && (
              <div>• Local Video: {videoEnabled ? 'Enabled' : 'Disabled'}</div>
            )}
          </div>
        </div>

        {/* Connection Status */}
        <div className="text-center">
          <div className={`inline-flex items-center space-x-2 px-3 py-1 rounded-full text-sm ${
            connectionStatus === 'connected' 
              ? 'bg-green-100 text-green-800' 
              : connectionStatus === 'connecting'
                ? 'bg-yellow-100 text-yellow-800'
                : 'bg-red-100 text-red-800'
          }`}>
            <div className={`w-2 h-2 rounded-full ${
              connectionStatus === 'connected' 
                ? 'bg-green-500' 
                : connectionStatus === 'connecting'
                  ? 'bg-yellow-500'
                  : 'bg-red-500'
            }`}></div>
            <span>
              {connectionStatus === 'connected' && 'Connected'}
              {connectionStatus === 'connecting' && 'Connecting...'}
              {connectionStatus === 'disconnected' && 'Disconnected'}
            </span>
          </div>
        </div>
      </div>
    </Card>
  )
} 