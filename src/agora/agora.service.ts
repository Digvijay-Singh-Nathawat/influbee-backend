import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RtcTokenBuilder, RtcRole, RtmTokenBuilder } from 'agora-token';
import { PrismaService } from '../prisma/prisma.service';
import { GenerateTokenDto, AgoraTokenType } from './dto/token.dto';

@Injectable()
export class AgoraService {
  private readonly logger = new Logger(AgoraService.name);
  private readonly appId: string;
  private readonly appCertificate: string;
  private readonly tokenCache = new Map<string, { token: string; uid: number; expiry: number }>();

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.appId = this.configService.get<string>('AGORA_APP_ID') || '';
    this.appCertificate = this.configService.get<string>('AGORA_APP_CERTIFICATE') || '';
    
    if (!this.appId || !this.appCertificate) {
      this.logger.warn('Agora credentials not configured. Please set AGORA_APP_ID and AGORA_APP_CERTIFICATE in your environment variables.');
    }
  }

  /**
   * Get Agora App ID - used by frontend for SDK initialization
   */
  getAppId(): string {
    return this.appId;
  }

  /**
   * Generate RTC Token for video/voice calling with caching
   */
  async generateRtcToken(generateTokenDto: GenerateTokenDto, uid: number = 0): Promise<string> {
    try {
      const { channelName, expirationInSeconds = 3600, role = 'publisher' } = generateTokenDto;
      
      // Check cache first
      const cacheKey = `${channelName}_${uid}_${role}`;
      const cached = this.tokenCache.get(cacheKey);
      if (cached && cached.expiry > Date.now()) {
        this.logger.debug(`Using cached RTC token for ${cacheKey}`);
        return cached.token;
      }

      if (!this.appId) {
        throw new BadRequestException('Agora App ID not configured');
      }

      // Ensure we have App Certificate for secure mode
      if (!this.appCertificate) {
        throw new BadRequestException('App Certificate is required for secure mode. Please set AGORA_APP_CERTIFICATE in your .env file.');
      }

      // Secure mode: generate actual token
      this.logger.log(`Generating RTC token for secure mode`);
      console.log('🔥 AGORA BACKEND: Generating RTC token with credentials:', {
        appId: this.appId,
        appCertificate: this.appCertificate.substring(0, 8) + '...',
        channelName,
        uid,
        role
      });

      const currentTimestamp = Math.floor(Date.now() / 1000);
      const privilegeExpiredTs = currentTimestamp + expirationInSeconds;

      // Convert role to Agora RTC role
      const rtcRole = role === 'publisher' ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER;

      // Generate RTC token for Video/Voice calling
      const token = RtcTokenBuilder.buildTokenWithUid(
        this.appId,
        this.appCertificate,
        channelName,
        uid,
        rtcRole,
        privilegeExpiredTs,
        privilegeExpiredTs
      );

      // Cache the token for 30 seconds to prevent rapid regeneration
      this.tokenCache.set(cacheKey, {
        token,
        uid,
        expiry: Date.now() + 30000 // 30 seconds
      });

      console.log('🔥 AGORA BACKEND: ✅ Generated RTC token:', {
        channel: channelName,
        uid,
        tokenLength: token.length,
        tokenPrefix: token.substring(0, 20) + '...'
      });
      
      return token;
    } catch (error) {
      this.logger.error(`Failed to generate RTC token: ${error.message}`);
      throw new BadRequestException('Failed to generate RTC token');
    }
  }

  /**
   * Generate Chat Token for Agora Chat SDK
   * Chat uses a different token format than RTM
   */
  async generateChatToken(userId: string, expirationInSeconds: number = 3600): Promise<string> {
    try {
      if (!this.appId || !this.appCertificate) {
        throw new BadRequestException('Agora credentials not configured');
      }

      const currentTimestamp = Math.floor(Date.now() / 1000);
      const privilegeExpiredTs = currentTimestamp + expirationInSeconds;

      // For Agora Chat, we use RtmTokenBuilder as it provides the same format
      // that Chat SDK expects
      const token = RtmTokenBuilder.buildToken(
        this.appId,
        this.appCertificate,
        userId,
        privilegeExpiredTs
      );

      console.log('🔥 AGORA BACKEND: ✅ Generated Chat token:', {
        userId,
        tokenLength: token.length,
        tokenPrefix: token.substring(0, 20) + '...'
      });
      
      return token;
    } catch (error) {
      this.logger.error(`Failed to generate Chat token: ${error.message}`);
      throw new BadRequestException('Failed to generate Chat token');
    }
  }

  /**
   * Generate RTM Token for legacy RTM usage (if needed)
   * @deprecated Use generateChatToken for Agora Chat SDK
   */
  async generateRtmToken(userId: string, expirationInSeconds: number = 3600): Promise<string> {
    this.logger.warn('RTM token generation is deprecated. Use Chat token instead.');
    return this.generateChatToken(userId, expirationInSeconds);
  }

  /**
   * Generate a unique channel name for calls
   */
  generateChannelName(userId1: string, userId2: string): string {
    // Sort user IDs to ensure consistent channel names regardless of who initiates
    const sortedIds = [userId1, userId2].sort();
    const timestamp = Date.now();
    return `call_${sortedIds[0]}_${sortedIds[1]}_${timestamp}`;
  }

  /**
   * Generate UID for Agora services from user ID
   * Agora requires numeric UIDs for RTC
   */
  generateUidFromUserId(userId: string): number {
    // Create a more unique UID by combining userId with current timestamp
    const timestamp = Date.now();
    const timestampSuffix = timestamp % 10000; // Last 4 digits for uniqueness
    
    // Convert string to a consistent numeric ID
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      const char = userId.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    // Combine hash with timestamp suffix for better uniqueness
    const combinedHash = Math.abs(hash) + timestampSuffix;
    
    // Ensure positive number and within Agora's UID range (1 to 2^32-1)
    const uid = (combinedHash % 2147483647) || 1;
    
    this.logger.debug(`Generated UID ${uid} for user ${userId} (timestamp: ${timestampSuffix})`);
    return uid;
  }

  /**
   * Register user with Agora Chat (if needed for user management)
   */
  async registerChatUser(userId: string, password: string): Promise<void> {
    try {
      // This would typically be done via Agora's REST API
      // For now, we'll just log that the user should be registered
      this.logger.log(`User ${userId} should be registered with Agora Chat`);
      
      // In production, you would call Agora's Chat REST API to register the user
      // await this.registerUserViaRestAPI(userId, password);
    } catch (error) {
      this.logger.error(`Failed to register chat user: ${error.message}`);
      throw new BadRequestException('Failed to register chat user');
    }
  }

  /**
   * Generate comprehensive Agora credentials for a user
   */
  async generateUserCredentials(userId: string): Promise<{
    appId: string;
    chatToken: string;
    uid: number;
  }> {
    try {
      console.log('🔥 AGORA BACKEND: Generating comprehensive credentials for user:', userId);
      
      const chatToken = await this.generateChatToken(userId);
      const uid = this.generateUidFromUserId(userId);

      const credentials = {
        appId: this.appId,
        chatToken,
        uid,
      };

      console.log('🔥 AGORA BACKEND: ✅ Generated comprehensive credentials:', {
        appId: this.appId,
        userId,
        uid,
        hasChatToken: !!chatToken,
        chatTokenLength: chatToken?.length || 0
      });

      return credentials;
    } catch (error) {
      console.error('🔥 AGORA BACKEND: ❌ Failed to generate user credentials:', error);
      this.logger.error(`Failed to generate user credentials: ${error.message}`);
      throw new BadRequestException('Failed to generate user credentials');
    }
  }
}