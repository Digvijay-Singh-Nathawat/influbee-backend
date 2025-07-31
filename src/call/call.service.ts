import { Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { AgoraService } from '../agora/agora.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

export interface CallInitiateDto {
  receiverId: string;
  callType: 'VOICE' | 'VIDEO';
  estimatedDuration: number;
}

export interface CallStartDto {
  callId: string;
}

export interface CallEndDto {
  callId: string;
  actualDuration: number;
}

@Injectable()
export class CallService {
  private readonly logger = new Logger(CallService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly walletService: WalletService,
    private readonly agoraService: AgoraService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Initiate a call - creates basic call record for tracking only
   */
  async initiateCall(
    initiatorId: string,
    receiverId: string,
    type: 'VOICE' | 'VIDEO',
    estimatedDuration: number = 5,
  ): Promise<any> {
    // Get user details
    const [initiator, receiver] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: initiatorId },
        select: { id: true, username: true, displayName: true, role: true },
      }),
      this.prisma.user.findUnique({
        where: { id: receiverId },
        select: { id: true, username: true, displayName: true, role: true },
      }),
    ]);

    if (!initiator || !receiver) {
      throw new NotFoundException('User not found');
    }

    // Generate unique channel name
    const channelName = `call_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    // Create basic call record - no billing for now
    const call = await this.prisma.call.create({
      data: {
        initiatorId,
        receiverId,
        type,
        status: 'INITIATED',
        estimatedDuration,
        estimatedCost: 0, // No billing
        channelName,
        agoraChannelName: channelName,
      },
      include: {
        initiator: {
          select: {
            id: true,
            username: true,
            displayName: true,
            role: true,
          },
        },
        receiver: {
          select: {
            id: true,
            username: true,
            displayName: true,
            role: true,
          },
        },
      },
    });

    // Generate Agora token
    console.log('🔥 AGORA: Generating RTC token for call', {
      channelName,
      initiatorId,
      receiverId,
      callType: type
    });
    
    const token = await this.agoraService.generateRtcToken(
      { 
        channelName,
        tokenType: 'rtc' as any,
        expirationInSeconds: 3600,
        role: 'publisher'
      },
      parseInt(initiatorId.substring(0, 8), 16)
    );
    
    console.log('🔥 AGORA: RTC token generated successfully', {
      tokenLength: token.length,
      tokenPrefix: token.substring(0, 20) + '...'
    });

    // Emit event for real-time notifications
    this.eventEmitter.emit('call.initiated', {
      callId: call.id,
      callerId: initiatorId,
      receiverId,
      callType: type,
      channelName: call.channelName,
      estimatedDuration,
      initiator: initiator,
      receiver: receiver,
    });

    return {
      call: {
        id: call.id,
        channelName: call.channelName,
        type: call.type,
        status: call.status,
        estimatedDuration: call.estimatedDuration,
        createdAt: call.createdAt,
        initiator: call.initiator,
        receiver: call.receiver,
      },
      token,
    };
  }

  /**
   * Start a call - simple status update
   */
  async startCall(callId: string, userId: string): Promise<any> {
    console.log('🔥 AGORA BACKEND: Starting call with callId:', callId, 'userId:', userId);
    
    const call = await this.prisma.call.findUnique({
      where: { id: callId },
      include: {
        initiator: {
          select: {
            id: true,
            username: true,
            displayName: true,
            role: true,
          },
        },
        receiver: {
          select: {
            id: true,
            username: true,
            displayName: true,
            role: true,
          },
        },
      },
    });

    if (!call) {
      console.log('🔥 AGORA BACKEND: ❌ Call not found:', callId);
      throw new NotFoundException('Call not found');
    }

    console.log('🔥 AGORA BACKEND: Call found with status:', call.status);

    // Check if call can be joined
    if (call.status !== 'INITIATED' && call.status !== 'CONNECTED') {
      console.log('🔥 AGORA BACKEND: ❌ Call cannot be started, current status:', call.status);
      throw new BadRequestException(`Call cannot be started. Current status: ${call.status}`);
    }

    if (call.receiverId !== userId && call.initiatorId !== userId) {
      console.log('🔥 AGORA BACKEND: ❌ Unauthorized to start call. Call parties:', {
        initiatorId: call.initiatorId,
        receiverId: call.receiverId,
        requestingUserId: userId
      });
      throw new ForbiddenException('Unauthorized to start this call');
    }

    // If call is already connected, just return the call info (user is joining)
    if (call.status === 'CONNECTED') {
      console.log('🔥 AGORA BACKEND: ✅ User joining already connected call:', userId);
      
      // Emit call joined event
      this.eventEmitter.emit('call.joined', {
        callId: call.id,
        userId,
        channelName: call.channelName,
      });

      return {
        call: {
          id: call.id,
          channelName: call.channelName,
          type: call.type,
          status: call.status,
          estimatedDuration: call.estimatedDuration,
          createdAt: call.createdAt,
          connectedAt: call.connectedAt,
          initiator: call.initiator,
          receiver: call.receiver,
        },
      };
    }

    console.log('🔥 AGORA BACKEND: Updating call status to CONNECTED...');
    
    // Update call status to CONNECTED (first user joining)
    const updatedCall = await this.prisma.call.update({
      where: { id: callId },
      data: {
        status: 'CONNECTED',
        connectedAt: new Date(),
      },
      include: {
        initiator: {
          select: {
            id: true,
            username: true,
            displayName: true,
            role: true,
          },
        },
        receiver: {
          select: {
            id: true,
            username: true,
            displayName: true,
            role: true,
          },
        },
      },
    });

    console.log('🔥 AGORA BACKEND: ✅ Call status updated to CONNECTED successfully');

    // Emit call joined event
    this.eventEmitter.emit('call.joined', {
      callId: call.id,
      userId,
      channelName: call.channelName,
    });

    console.log('🔥 AGORA BACKEND: ✅ Call started successfully for user:', userId);

    return {
      call: {
        id: updatedCall.id,
        channelName: updatedCall.channelName,
        type: updatedCall.type,
        status: updatedCall.status,
        estimatedDuration: updatedCall.estimatedDuration,
        createdAt: updatedCall.createdAt,
        connectedAt: updatedCall.connectedAt,
        initiator: updatedCall.initiator,
        receiver: updatedCall.receiver,
      },
    };
  }

  /**
   * End a call - simple tracking only
   */
  async endCall(callId: string, userId: string): Promise<any> {
    const call = await this.prisma.call.findUnique({
      where: { id: callId },
      include: {
        initiator: {
          select: {
            id: true,
            username: true,
            displayName: true,
            role: true,
          },
        },
        receiver: {
          select: {
            id: true,
            username: true,
            displayName: true,
            role: true,
          },
        },
      },
    });

    if (!call) {
      throw new NotFoundException('Call not found');
    }

    if (call.receiverId !== userId && call.initiatorId !== userId) {
      throw new ForbiddenException('Unauthorized to end this call');
    }

    // Don't allow ending an already ended call
    if (call.status === 'ENDED') {
      throw new BadRequestException('Call has already ended');
    }

    // Calculate basic duration
    const actualDuration = call.connectedAt 
      ? Math.floor((new Date().getTime() - call.connectedAt.getTime()) / 1000)
      : 0;

    // Update call - no billing complexity
    const updatedCall = await this.prisma.call.update({
      where: { id: callId },
      data: {
        status: 'ENDED',
        actualDuration: actualDuration,
        actualCost: 0, // No billing
        terminatedBy: userId,
        isCompleted: actualDuration > 0,
        endedAt: new Date(),
      },
      include: {
        initiator: {
          select: {
            id: true,
            username: true,
            displayName: true,
            role: true,
          },
        },
        receiver: {
          select: {
            id: true,
            username: true,
            displayName: true,
            role: true,
          },
        },
      },
    });

    // Emit call ended event
    this.eventEmitter.emit('call.ended', {
      callId: call.id,
      endedBy: userId,
      initiatorId: call.initiatorId,
      receiverId: call.receiverId,
      actualDuration: actualDuration,
      isCompleted: actualDuration > 0,
    });

    return {
      call: {
        id: updatedCall.id,
        channelName: updatedCall.channelName,
        type: updatedCall.type,
        status: updatedCall.status,
        actualDuration: updatedCall.actualDuration,
        isCompleted: updatedCall.isCompleted,
        terminatedBy: updatedCall.terminatedBy,
        createdAt: updatedCall.createdAt,
        endedAt: updatedCall.endedAt,
        initiator: updatedCall.initiator,
        receiver: updatedCall.receiver,
      },
    };
  }

  /**
   * Cancel a call before it starts
   */
  async cancelCall(callId: string, userId: string): Promise<any> {
    const call = await this.prisma.call.findUnique({
      where: { id: callId },
    });

    if (!call) {
      throw new NotFoundException('Call not found');
    }

    if (call.receiverId !== userId && call.initiatorId !== userId) {
      throw new ForbiddenException('Unauthorized to cancel this call');
    }

    if (call.status !== 'INITIATED') {
      throw new BadRequestException('Call cannot be cancelled');
    }

    // Update call status
    const updatedCall = await this.prisma.call.update({
      where: { id: callId },
      data: {
        status: 'FAILED' as any,
        terminatedBy: userId,
        terminationReason: 'CANCELLED',
        endedAt: new Date(),
      },
    });

    return {
      call: {
        id: updatedCall.id,
        status: updatedCall.status,
        terminationReason: updatedCall.terminationReason,
        endedAt: updatedCall.endedAt,
      },
    };
  }

  /**
   * Get call history for a user
   */
  async getCallHistory(userId: string): Promise<any> {
    const calls = await this.prisma.call.findMany({
      where: {
        OR: [
          { initiatorId: userId },
          { receiverId: userId },
        ],
      },
      include: {
        initiator: {
          select: {
            id: true,
            username: true,
            displayName: true,
          },
        },
        receiver: {
          select: {
            id: true,
            username: true,
            displayName: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return calls.map(call => ({
      id: call.id,
      type: call.type,
      status: call.status,
      estimatedDuration: call.estimatedDuration,
      estimatedCost: call.estimatedCost,
      actualDuration: call.actualDuration,
      actualCost: call.actualCost,
      createdAt: call.createdAt,
      endedAt: call.endedAt,
      initiator: call.initiator,
      receiver: call.receiver,
      isIncoming: call.receiverId === userId,
    }));
  }

  /**
   * Get active calls for monitoring
   */
  async getActiveCall(userId: string): Promise<any> {
    const call = await this.prisma.call.findFirst({
      where: {
        OR: [
          { initiatorId: userId },
          { receiverId: userId },
        ],
        status: {
          in: ['INITIATED', 'CONNECTED'],
        },
      },
      include: {
        initiator: {
          select: {
            id: true,
            username: true,
            displayName: true,
          },
        },
        receiver: {
          select: {
            id: true,
            username: true,
            displayName: true,
          },
        },
      },
    });

    if (!call) {
      return null;
    }

    return {
      id: call.id,
      channelName: call.channelName,
      type: call.type,
      status: call.status,
      estimatedDuration: call.estimatedDuration,
      estimatedCost: call.estimatedCost,
      actualDuration: call.actualDuration,
      actualCost: call.actualCost,
      createdAt: call.createdAt,
      endedAt: call.endedAt,
      initiator: call.initiator,
      receiver: call.receiver,
      isIncoming: call.receiverId === userId,
    };
  }
} 