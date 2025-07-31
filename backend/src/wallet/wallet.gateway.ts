import {
  WebSocketGateway,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  cors: {
    origin: ['http://localhost:3000'],
    credentials: true,
  },
  namespace: '/wallet',
})
export class WalletGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(WalletGateway.name);
  private connectedUsers = new Map<string, Socket>();

  handleConnection(client: Socket) {
    this.logger.log(`Wallet client connected: ${client.id}`);
    
    const userId = client.handshake.query.userId as string;
    if (userId) {
      this.connectedUsers.set(userId, client);
      this.logger.log(`User ${userId} connected to wallet service`);
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Wallet client disconnected: ${client.id}`);
    
    // Remove from connected users map
    for (const [userId, socket] of this.connectedUsers.entries()) {
      if (socket.id === client.id) {
        this.connectedUsers.delete(userId);
        break;
      }
    }
  }

  // Method to emit balance updates to specific user
  emitBalanceUpdate(userId: string, balance: number) {
    const socket = this.connectedUsers.get(userId);
    if (socket) {
      socket.emit('balance:updated', { balance });
      this.logger.log(`Balance update sent to user ${userId}: ${balance}`);
    }
  }

  // Method to emit transaction updates to specific user
  emitTransactionUpdate(userId: string, transaction: any) {
    const socket = this.connectedUsers.get(userId);
    if (socket) {
      socket.emit('transaction:added', { transaction });
      this.logger.log(`Transaction update sent to user ${userId}`);
    }
  }
} 