import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ChatService } from './chat.service';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  cors: {
    origin: ['http://localhost:3000'],
    credentials: true,
  },
  namespace: '/chat',
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);
  private userSockets = new Map<string, Socket>(); // userId -> socket

  constructor(private readonly chatService: ChatService) {}

  handleConnection(client: Socket) {
    this.logger.log(`Chat client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Chat client disconnected: ${client.id}`);
    
    // Remove user from connected users
    const userId = client.data.userId;
    if (userId) {
      this.userSockets.delete(userId);
      this.logger.log(`User ${userId} disconnected from chat`);
    }
  }

  @SubscribeMessage('user:register')
  async handleAuthentication(
    @MessageBody() data: { userId: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const { userId } = data;
      client.data.userId = userId;
      this.userSockets.set(userId, client);
      
      client.emit('user:registered', { success: true, userId });
      this.logger.log(`User ${userId} registered for chat notifications`);
    } catch (error) {
      this.logger.error(`Failed to register user: ${error.message}`);
      client.emit('user:register:error', { message: error.message });
    }
  }

  @SubscribeMessage('message:send')
  async handleSendMessage(
    @MessageBody() data: { receiverId: string; content: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const userId = client.data.userId;
      if (!userId) {
        client.emit('message:error', { message: 'User not authenticated' });
        return;
      }

      // Send message through chat service
      const message = await this.chatService.sendMessage(
        userId,
        data.receiverId,
        data.content,
      );

      // Emit to receiver if connected
      const receiverSocket = this.userSockets.get(data.receiverId);
      if (receiverSocket) {
        receiverSocket.emit('message:received', {
          id: message.id,
          content: message.content,
          senderId: message.senderId,
          receiverId: message.receiverId,
          createdAt: message.createdAt,
          sender: message.sender,
          isOwn: false,
        });
      }

      // Confirm to sender
      client.emit('message:sent', {
        id: message.id,
        content: message.content,
        senderId: message.senderId,
        receiverId: message.receiverId,
        createdAt: message.createdAt,
        sender: message.sender,
        isOwn: true,
      });

      this.logger.log(`Message sent from ${userId} to ${data.receiverId}`);
    } catch (error) {
      this.logger.error(`Failed to send message: ${error.message}`);
      client.emit('message:error', { message: error.message });
    }
  }

  @SubscribeMessage('messages:get')
  async handleGetMessages(
    @MessageBody() data: { partnerId: string; limit?: number },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const userId = client.data.userId;
      if (!userId) {
        client.emit('messages:error', { message: 'User not authenticated' });
        return;
      }

      const messages = await this.chatService.getMessages(
        userId,
        data.partnerId,
        data.limit || 50,
      );

      client.emit('messages:loaded', { 
        partnerId: data.partnerId, 
        messages 
      });
    } catch (error) {
      this.logger.error(`Failed to get messages: ${error.message}`);
      client.emit('messages:error', { message: error.message });
    }
  }

  @SubscribeMessage('typing:start')
  async handleTypingStart(
    @MessageBody() data: { partnerId: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const userId = client.data.userId;
      if (!userId) return;

      const partnerSocket = this.userSockets.get(data.partnerId);
      if (partnerSocket) {
        partnerSocket.emit('typing:partner-typing', {
          userId,
          isTyping: true,
        });
      }
    } catch (error) {
      this.logger.error(`Failed to handle typing start: ${error.message}`);
    }
  }

  @SubscribeMessage('typing:stop')
  async handleTypingStop(
    @MessageBody() data: { partnerId: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const userId = client.data.userId;
      if (!userId) return;

      const partnerSocket = this.userSockets.get(data.partnerId);
      if (partnerSocket) {
        partnerSocket.emit('typing:partner-typing', {
          userId,
          isTyping: false,
        });
      }
    } catch (error) {
      this.logger.error(`Failed to handle typing stop: ${error.message}`);
    }
  }

  // Helper methods
  getConnectedUsersCount(): number {
    return this.userSockets.size;
  }

  isUserOnline(userId: string): boolean {
    return this.userSockets.has(userId);
  }

  sendToUser(userId: string, event: string, data: any): boolean {
    const socket = this.userSockets.get(userId);
    if (socket) {
      socket.emit(event, data);
      return true;
    }
    return false;
  }
} 