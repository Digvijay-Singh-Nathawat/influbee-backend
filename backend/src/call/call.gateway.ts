import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UseGuards } from '@nestjs/common';
import { CallService } from './call.service';
import { OnEvent } from '@nestjs/event-emitter';

@WebSocketGateway({
  cors: {
    origin: ['http://localhost:3000'],
    credentials: true,
  },
  namespace: '/call',
})
export class CallGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(CallGateway.name);
  private connectedUsers = new Map<string, Socket>();

  constructor(private readonly callService: CallService) {}

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
    
    // Remove user from connected users
    const userId = client.data.userId;
    if (userId) {
      this.connectedUsers.delete(userId);
      this.logger.log(`User ${userId} disconnected from call gateway`);
    }
  }

  @SubscribeMessage('user:register')
  async handleUserRegister(
    @MessageBody() data: { userId: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const { userId } = data;
      client.data.userId = userId;
      this.connectedUsers.set(userId, client);
      
      client.emit('user:registered', { success: true, userId });
      this.logger.log(`User ${userId} registered for call notifications`);
    } catch (error) {
      this.logger.error(`Failed to register user: ${error.message}`);
      client.emit('user:register:error', { error: error.message });
    }
  }

  @SubscribeMessage('call:accept')
  async handleCallAccept(
    @MessageBody() data: { callId: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const { callId } = data;
      const userId = client.data.userId;
      
      if (!userId) {
        client.emit('call:accept:error', { error: 'User not authenticated' });
        return;
      }
      
      // Start the call
      const result = await this.callService.startCall(callId, userId);
      
      // Notify both participants
      this.server.to(`call:${callId}`).emit('call:accepted', {
        callId,
        acceptedBy: userId,
        call: result.call,
      });
      
      client.emit('call:accept:success', result);
      this.logger.log(`Call ${callId} accepted by user ${userId}`);
    } catch (error) {
      this.logger.error(`Failed to accept call: ${error.message}`);
      client.emit('call:accept:error', { error: error.message });
    }
  }

  @SubscribeMessage('call:reject')
  async handleCallReject(
    @MessageBody() data: { callId: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const { callId } = data;
      const userId = client.data.userId;
      
      if (!userId) {
        client.emit('call:reject:error', { error: 'User not authenticated' });
        return;
      }
      
      // Cancel the call
      const result = await this.callService.cancelCall(callId, userId);
      
      // Notify the caller
      this.server.to(`call:${callId}`).emit('call:rejected', {
        callId,
        rejectedBy: userId,
      });
      
      client.emit('call:reject:success', result);
      this.logger.log(`Call ${callId} rejected by user ${userId}`);
    } catch (error) {
      this.logger.error(`Failed to reject call: ${error.message}`);
      client.emit('call:reject:error', { error: error.message });
    }
  }

  @SubscribeMessage('call:end')
  async handleCallEnd(
    @MessageBody() data: { callId: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const { callId } = data;
      const userId = client.data.userId;
      
      if (!userId) {
        client.emit('call:end:error', { error: 'User not authenticated' });
        return;
      }
      
      // End the call
      const result = await this.callService.endCall(callId, userId);
      
      client.emit('call:end:success', result);
      this.logger.log(`Call ${callId} ended by user ${userId}`);
    } catch (error) {
      this.logger.error(`Failed to handle call end: ${error.message}`);
      client.emit('call:end:error', { error: error.message });
    }
  }

  // Event handlers for call service events

  @OnEvent('call.initiated')
  handleCallInitiated(payload: any) {
    const { 
      callId, 
      callerId, 
      receiverId, 
      callType, 
      channelName, 
      estimatedDuration,
      initiator,
      receiver 
    } = payload;
    
    // Join caller to call room
    const callerSocket = this.connectedUsers.get(callerId);
    if (callerSocket) {
      callerSocket.join(`call:${callId}`);
    }
    
    // Send invitation to receiver
    const receiverSocket = this.connectedUsers.get(receiverId);
    if (receiverSocket) {
      receiverSocket.join(`call:${callId}`);
      receiverSocket.emit('call:incoming', {
        callId,
        callType,
        channelName,
        estimatedDuration,
        initiator: initiator,
        receiver: receiver,
        timestamp: new Date().toISOString(),
      });
      
      this.logger.log(`Call invitation sent: ${callId} from ${callerId} to ${receiverId}`);
    } else {
      // Receiver is offline
      if (callerSocket) {
        callerSocket.emit('call:receiver-offline', {
          callId,
          receiverId,
          message: 'User is currently offline',
        });
      }
      this.logger.log(`Call invitation failed - receiver offline: ${receiverId}`);
    }
  }

  @OnEvent('call.joined')
  handleCallJoined(payload: any) {
    const { callId, userId, channelName } = payload;
    
    // Notify all participants in call room
    this.server.to(`call:${callId}`).emit('call:user-joined', {
      callId,
      userId,
      channelName,
      timestamp: new Date().toISOString(),
    });
    
    this.logger.log(`Call joined event: ${callId} by ${userId}`);
  }

  @OnEvent('call.ended')
  handleCallEnded(payload: any) {
    const { 
      callId, 
      endedBy, 
      initiatorId, 
      receiverId, 
      actualDuration,
      isCompleted 
    } = payload;
    
    // Notify both participants that call ended
    const initiatorSocket = this.connectedUsers.get(initiatorId);
    const receiverSocket = this.connectedUsers.get(receiverId);
    
    const callEndedData = {
      callId,
      endedBy,
      duration: actualDuration,
      isCompleted,
      timestamp: new Date().toISOString(),
    };
    
    if (initiatorSocket) {
      initiatorSocket.emit('call:ended', callEndedData);
      initiatorSocket.leave(`call:${callId}`);
    }
    
    if (receiverSocket) {
      receiverSocket.emit('call:ended', callEndedData);
      receiverSocket.leave(`call:${callId}`);
    }
    
    // Also broadcast to the call room
    this.server.to(`call:${callId}`).emit('call:ended', callEndedData);
    
    // Remove all users from the call room
    this.server.in(`call:${callId}`).socketsLeave(`call:${callId}`);
    
    this.logger.log(`Call ended event: ${callId} - Duration: ${actualDuration}s, Ended by: ${endedBy}`);
  }

  @OnEvent('call.cancelled')
  handleCallCancelled(payload: any) {
    const { callId, userId } = payload;
    
    // Notify all participants that call was cancelled
    this.server.to(`call:${callId}`).emit('call:cancelled', {
      callId,
      cancelledBy: userId,
      reason: 'Call was cancelled',
      timestamp: new Date().toISOString(),
    });
    
    // Remove all users from the call room
    this.server.in(`call:${callId}`).socketsLeave(`call:${callId}`);
    
    this.logger.log(`Call cancelled event: ${callId} by ${userId}`);
  }

  // Helper methods
  getConnectedUsersCount(): number {
    return this.connectedUsers.size;
  }

  isUserOnline(userId: string): boolean {
    return this.connectedUsers.has(userId);
  }

  sendToUser(userId: string, event: string, data: any): boolean {
    const socket = this.connectedUsers.get(userId);
    if (socket) {
      socket.emit(event, data);
      return true;
    }
    return false;
  }
} 