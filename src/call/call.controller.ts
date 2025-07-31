import { Controller, Post, Get, Param, Body, UseGuards } from '@nestjs/common';
import { CallService, CallInitiateDto, CallStartDto, CallEndDto } from './call.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('calls')
export class CallController {
  constructor(private readonly callService: CallService) {}

  /**
   * Initiate a new call
   */
  @UseGuards(JwtAuthGuard)
  @Post('initiate')
  async initiateCall(
    @CurrentUser() user: any,
    @Body() initiateCallDto: any,
  ) {
    const result = await this.callService.initiateCall(
      user.id,
      initiateCallDto.receiverId,
      initiateCallDto.callType,
      initiateCallDto.estimatedDuration,
    );
    return {
      success: true,
      message: 'Call initiated successfully',
      data: result,
    };
  }

  /**
   * Start a call
   */
  @UseGuards(JwtAuthGuard)
  @Post('start')
  async startCall(
    @CurrentUser() user: any,
    @Body() startCallDto: any,
  ) {
    const result = await this.callService.startCall(startCallDto.callId, user.id);
    return {
      success: true,
      message: 'Call started successfully',
      data: result,
    };
  }

  /**
   * End a call
   */
  @UseGuards(JwtAuthGuard)
  @Post('end')
  async endCall(
    @CurrentUser() user: any,
    @Body() endCallDto: any,
  ) {
    const result = await this.callService.endCall(endCallDto.callId, user.id);
    return {
      success: true,
      message: 'Call ended successfully',
      data: result,
    };
  }

  /**
   * Cancel a call
   */
  @UseGuards(JwtAuthGuard)
  @Post(':callId/cancel')
  async cancelCall(
    @CurrentUser() user: any,
    @Param('callId') callId: string,
  ) {
    const result = await this.callService.cancelCall(callId, user.id);
    return {
      success: true,
      message: 'Call cancelled successfully',
      data: result,
    };
  }

  /**
   * Get call history
   */
  @UseGuards(JwtAuthGuard)
  @Get('history')
  async getCallHistory(@CurrentUser() user: any) {
    const calls = await this.callService.getCallHistory(user.id);
    return {
      success: true,
      data: calls,
    };
  }

  /**
   * Get active call
   */
  @UseGuards(JwtAuthGuard)
  @Get('active')
  async getActiveCall(@CurrentUser() user: any) {
    const call = await this.callService.getActiveCall(user.id);
    return {
      success: true,
      data: call,
    };
  }
} 