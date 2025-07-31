import { Controller, Post, Body, UseGuards, BadRequestException } from '@nestjs/common';
import { AgoraService } from './agora.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { GenerateTokenDto } from './dto/token.dto';

@Controller('agora')
export class AgoraController {
  constructor(private readonly agoraService: AgoraService) {}

  /**
   * Generate RTC token for Video/Voice calling
   */
  @UseGuards(JwtAuthGuard)
  @Post('token/rtc')
  async generateRtcToken(
    @CurrentUser() user: any,
    @Body() generateTokenDto: GenerateTokenDto,
  ) {
    try {
      const uid = this.agoraService.generateUidFromUserId(user.id);
      const token = await this.agoraService.generateRtcToken(generateTokenDto, uid);
      
      return {
        success: true,
        data: {
          token,
          appId: this.agoraService.getAppId(),
          uid,
          channelName: generateTokenDto.channelName,
          expirationInSeconds: generateTokenDto.expirationInSeconds || 3600,
        },
        message: 'RTC token generated successfully',
      };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  /**
   * Generate Chat token for Agora Chat SDK
   */
  @UseGuards(JwtAuthGuard)
  @Post('token/chat')
  async generateChatToken(
    @CurrentUser() user: any,
    @Body() body: { expirationInSeconds?: number },
  ) {
    try {
      const { expirationInSeconds = 3600 } = body;
      const token = await this.agoraService.generateChatToken(user.id, expirationInSeconds);
      
      return {
        success: true,
        data: {
          token,
          appId: this.agoraService.getAppId(),
          userId: user.id,
          expirationInSeconds,
        },
        message: 'Chat token generated successfully',
      };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  /**
   * Generate RTM token (legacy - redirects to chat token)
   * @deprecated Use /token/chat instead
   */
  @UseGuards(JwtAuthGuard)
  @Post('token/rtm')
  async generateRtmToken(
    @CurrentUser() user: any,
    @Body() body: { expirationInSeconds?: number },
  ) {
    // Redirect to chat token for backward compatibility
    return this.generateChatToken(user, body);
  }

  /**
   * Get comprehensive Agora credentials for a user
   */
  @UseGuards(JwtAuthGuard)
  @Post('credentials')
  async getUserCredentials(@CurrentUser() user: any) {
    try {
      const credentials = await this.agoraService.generateUserCredentials(user.id);
      
      return {
        success: true,
        data: credentials,
        message: 'Agora credentials generated successfully',
      };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  /**
   * Generate channel name for calls
   */
  @UseGuards(JwtAuthGuard)
  @Post('channel/generate')
  async generateChannelName(
    @CurrentUser() user: any,
    @Body() body: { receiverId: string },
  ) {
    try {
      const { receiverId } = body;
      const channelName = this.agoraService.generateChannelName(user.id, receiverId);
      
      return {
        success: true,
        data: {
          channelName,
          appId: this.agoraService.getAppId(),
        },
        message: 'Channel name generated successfully',
      };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }
} 