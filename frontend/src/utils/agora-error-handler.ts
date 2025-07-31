// Agora Error Handler and Logger
// This utility helps with debugging Agora connection issues

export enum AgoraErrorType {
  RTM_CONNECTION = 'RTM_CONNECTION',
  RTC_CONNECTION = 'RTC_CONNECTION',
  SOCKET_CONNECTION = 'SOCKET_CONNECTION',
  MEDIA_PERMISSIONS = 'MEDIA_PERMISSIONS',
  TOKEN_GENERATION = 'TOKEN_GENERATION',
  AUDIO_TRACK = 'AUDIO_TRACK',
  VIDEO_TRACK = 'VIDEO_TRACK',
  CHANNEL_JOIN = 'CHANNEL_JOIN',
  TRACK_PUBLISH = 'TRACK_PUBLISH',
  GENERAL = 'GENERAL'
}

export interface AgoraError {
  type: AgoraErrorType
  code?: string | number
  message: string
  details?: any
  timestamp: string
  userId?: string
  channelName?: string
  actionAttempted?: string
  userAgent?: string
  recoverable?: boolean
  retryCount?: number
}

export interface AgoraLogEvent {
  type: 'INFO' | 'WARNING' | 'ERROR' | 'DEBUG'
  category: string
  message: string
  data?: any
  timestamp: string
  userId?: string
}

class AgoraErrorHandler {
  private static instance: AgoraErrorHandler
  private errors: AgoraError[] = []
  private logs: AgoraLogEvent[] = []
  private maxErrors = 100
  private maxLogs = 200
  private debugMode = process.env.NODE_ENV === 'development'

  private constructor() {}

  static getInstance(): AgoraErrorHandler {
    if (!AgoraErrorHandler.instance) {
      AgoraErrorHandler.instance = new AgoraErrorHandler()
    }
    return AgoraErrorHandler.instance
  }

  // Log an error with context
  logError(error: Partial<AgoraError>): void {
    const errorEntry: AgoraError = {
      type: error.type || AgoraErrorType.GENERAL,
      message: error.message || 'Unknown error',
      timestamp: new Date().toISOString(),
      userAgent: typeof window !== 'undefined' ? window.navigator.userAgent : 'Unknown',
      recoverable: error.recoverable !== undefined ? error.recoverable : true,
      retryCount: error.retryCount || 0,
      ...error
    }

    this.errors.push(errorEntry)
    
    // Keep only recent errors
    if (this.errors.length > this.maxErrors) {
      this.errors = this.errors.slice(-this.maxErrors)
    }

    // Log to console with appropriate level
    if (this.debugMode) {
      console.error('🔥 AGORA ERROR:', errorEntry)
    }

    // Send to monitoring service in production
    if (process.env.NODE_ENV === 'production') {
      this.sendToMonitoring(errorEntry)
    }
  }

  // Log general events
  log(event: Partial<AgoraLogEvent>): void {
    const logEntry: AgoraLogEvent = {
      type: event.type || 'INFO',
      category: event.category || 'GENERAL',
      message: event.message || '',
      timestamp: new Date().toISOString(),
      ...event
    }

    this.logs.push(logEntry)
    
    // Keep only recent logs
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs)
    }

    // Log to console based on type
    if (this.debugMode) {
      const logMethod = logEntry.type === 'ERROR' ? console.error : 
                       logEntry.type === 'WARNING' ? console.warn : console.log
      logMethod(`🔥 AGORA ${logEntry.type}:`, logEntry.message, logEntry.data)
    }
  }

  // Get error analysis
  getErrorAnalysis(): {
    totalErrors: number
    errorsByType: Record<string, number>
    recentErrors: AgoraError[]
    commonIssues: string[]
  } {
    const errorsByType: Record<string, number> = {}
    
    this.errors.forEach(error => {
      errorsByType[error.type] = (errorsByType[error.type] || 0) + 1
    })

    const recentErrors = this.errors.slice(-10)
    const commonIssues = this.getCommonIssues()

    return {
      totalErrors: this.errors.length,
      errorsByType,
      recentErrors,
      commonIssues
    }
  }

  // Get common issues and solutions
  private getCommonIssues(): string[] {
    const issues: string[] = []
    
    // Check for common error patterns
    const rtmErrors = this.errors.filter(e => e.type === AgoraErrorType.RTM_CONNECTION)
    const rtcErrors = this.errors.filter(e => e.type === AgoraErrorType.RTC_CONNECTION)
    const socketErrors = this.errors.filter(e => e.type === AgoraErrorType.SOCKET_CONNECTION)
    const mediaErrors = this.errors.filter(e => e.type === AgoraErrorType.MEDIA_PERMISSIONS)

    if (rtmErrors.length > 3) {
      issues.push('Multiple RTM connection failures - check network connectivity')
    }
    
    if (rtcErrors.length > 3) {
      issues.push('Multiple RTC connection failures - verify token generation')
    }
    
    if (socketErrors.length > 3) {
      issues.push('WebSocket connection issues - check backend server')
    }
    
    if (mediaErrors.length > 0) {
      issues.push('Media permission issues - user needs to allow microphone/camera access')
    }

    return issues
  }

  // Clear stored errors and logs
  clearLogs(): void {
    this.errors = []
    this.logs = []
  }

  // Get all errors for debugging
  getAllErrors(): AgoraError[] {
    return [...this.errors]
  }

  // Get all logs for debugging
  getAllLogs(): AgoraLogEvent[] {
    return [...this.logs]
  }

  // Send error to monitoring service
  private sendToMonitoring(error: AgoraError): void {
    // Implementation would depend on your monitoring service
    // Example: Sentry, LogRocket, etc.
    try {
      // Example implementation
      // Sentry.captureException(new Error(error.message), {
      //   tags: {
      //     type: error.type,
      //     userId: error.userId,
      //     channelName: error.channelName
      //   },
      //   extra: error.details
      // })
    } catch (e) {
      console.error('Failed to send error to monitoring:', e)
    }
  }
}

// Helper functions for common error scenarios
export const AgoraErrorHelpers = {
  // Handle RTM connection errors
  handleRTMError: (error: any, userId?: string) => {
    const handler = AgoraErrorHandler.getInstance()
    
    let message = 'RTM connection failed'
    let recoverable = true
    
    if (error.message?.includes('kicked off by remote session')) {
      message = 'Multiple RTM instances detected - connection kicked off'
      recoverable = false
    } else if (error.message?.includes('No cloud proxy server')) {
      message = 'RTM cloud proxy server unavailable'
      recoverable = true
    } else if (error.message?.includes('token expired')) {
      message = 'RTM token expired'
      recoverable = true
    }
    
    handler.logError({
      type: AgoraErrorType.RTM_CONNECTION,
      message,
      details: error,
      userId,
      recoverable
    })
  },

  // Handle RTC connection errors
  handleRTCError: (error: any, channelName?: string, userId?: string) => {
    const handler = AgoraErrorHandler.getInstance()
    
    let message = 'RTC connection failed'
    let recoverable = true
    
    if (error.code === 'INVALID_TOKEN') {
      message = 'Invalid RTC token'
      recoverable = true
    } else if (error.code === 'TOKEN_EXPIRED') {
      message = 'RTC token expired'
      recoverable = true
    } else if (error.code === 'INVALID_CHANNEL') {
      message = 'Invalid channel name'
      recoverable = false
    }
    
    handler.logError({
      type: AgoraErrorType.RTC_CONNECTION,
      message,
      details: error,
      channelName,
      userId,
      recoverable
    })
  },

  // Handle media permission errors
  handleMediaError: (error: any, userId?: string) => {
    const handler = AgoraErrorHandler.getInstance()
    
    let message = 'Media access failed'
    let recoverable = false
    
    if (error.name === 'NotAllowedError') {
      message = 'User denied media permissions'
      recoverable = false
    } else if (error.name === 'NotFoundError') {
      message = 'No media devices found'
      recoverable = false
    } else if (error.name === 'NotReadableError') {
      message = 'Media device busy'
      recoverable = true
    }
    
    handler.logError({
      type: AgoraErrorType.MEDIA_PERMISSIONS,
      message,
      details: error,
      userId,
      recoverable
    })
  },

  // Handle socket connection errors
  handleSocketError: (error: any, namespace: string, userId?: string) => {
    const handler = AgoraErrorHandler.getInstance()
    
    handler.logError({
      type: AgoraErrorType.SOCKET_CONNECTION,
      message: `Socket connection failed for ${namespace}`,
      details: error,
      userId,
      recoverable: true
    })
  },

  // Log successful operations
  logSuccess: (category: string, message: string, data?: any, userId?: string) => {
    const handler = AgoraErrorHandler.getInstance()
    
    handler.log({
      type: 'INFO',
      category,
      message,
      data,
      userId
    })
  },

  // Log warnings
  logWarning: (category: string, message: string, data?: any, userId?: string) => {
    const handler = AgoraErrorHandler.getInstance()
    
    handler.log({
      type: 'WARNING',
      category,
      message,
      data,
      userId
    })
  }
}

// Export the singleton instance
export const agoraErrorHandler = AgoraErrorHandler.getInstance()
export default AgoraErrorHandler 