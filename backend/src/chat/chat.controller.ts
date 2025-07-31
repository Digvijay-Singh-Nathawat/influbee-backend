import { Controller, Post, Get, Param, Body, UseGuards, Query } from '@nestjs/common';
import { ChatService, SendMessageDto } from './chat.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  /**
   * Send a message (for billing/record purposes)
   * Frontend expects: POST /chat/messages
   */
  @UseGuards(JwtAuthGuard)
  @Post('messages')
  async sendMessage(
    @CurrentUser() user: any,
    @Body() sendMessageDto: any,
  ) {
    const message = await this.chatService.sendMessage(
      user.id,
      sendMessageDto.receiverId,
      sendMessageDto.content,
    );
    return {
      success: true,
      data: {
        message: message, // Frontend expects response.data.data.message.id
      },
    };
  }

  /**
   * Legacy endpoint for backwards compatibility
   */
  @UseGuards(JwtAuthGuard)
  @Post('send')
  async sendMessageLegacy(
    @CurrentUser() user: any,
    @Body() sendMessageDto: any,
  ) {
    return this.sendMessage(user, sendMessageDto);
  }

  /**
   * Get conversation history with a specific user
   */
  @UseGuards(JwtAuthGuard)
  @Get('conversations/:partnerId')
  async getMessages(
    @CurrentUser() user: any,
    @Param('partnerId') partnerId: string,
    @Query('limit') limit?: string,
  ) {
    const messages = await this.chatService.getMessages(
      user.id,
      partnerId,
      limit ? parseInt(limit) : undefined,
    );
    return {
      success: true,
      data: messages,
    };
  }

  /**
   * Get available users for chatting
   */
  @UseGuards(JwtAuthGuard)
  @Get('users/available')
  async getAvailableUsers(@CurrentUser() user: any) {
    const users = await this.chatService.getAvailableUsers(user.id);
    return {
      success: true,
      data: users,
    };
  }

  /**
   * Get user's chat statistics
   */
  @UseGuards(JwtAuthGuard)
  @Get('stats')
  async getChatStats(@CurrentUser() user: any) {
    const stats = await this.chatService.getChatStats(user.id);
    return {
      success: true,
      data: stats,
    };
  }

  /**
   * Get recent conversations
   */
  @UseGuards(JwtAuthGuard)
  @Get('conversations')
  async getConversations(@CurrentUser() user: any) {
    const conversations = await this.chatService.getConversations(user.id);
    return {
      success: true,
      data: conversations,
    };
  }
} 