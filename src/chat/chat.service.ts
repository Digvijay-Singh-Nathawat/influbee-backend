import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';

export interface SendMessageDto {
  receiverId: string;
  content: string;
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly walletService: WalletService,
  ) {}

  /**
   * Send a message - handles billing and storage for record keeping
   * Real-time messaging is handled by Agora Chat SDK
   */
  async sendMessage(senderId: string, receiverId: string, content: string): Promise<any> {
    // Check if users exist and get their roles
    const [sender, receiver] = await Promise.all([
      this.prisma.user.findUnique({ 
        where: { id: senderId },
        select: { id: true, username: true, displayName: true, role: true }
      }),
      this.prisma.user.findUnique({ 
        where: { id: receiverId },
        select: { id: true, username: true, displayName: true, role: true }
      }),
    ]);

    if (!sender || !receiver) {
      throw new NotFoundException('User not found');
    }

    // Both users and influencers can send messages
    // But we only charge users (not influencers)
    const shouldChargeSender = sender.role === 'USER';

    const messageCost = 10000; // ₹100.00 per message (stored in paisa)
    
    // Only check balance if sender is a USER (who will be charged)
    if (shouldChargeSender) {
      const senderBalance = await this.walletService.getBalance(senderId);
      
      if (senderBalance < messageCost) {
        throw new BadRequestException('Insufficient balance to send message');
      }
    }

    // Generate unique message ID for Agora Chat
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    // Create message record
    const message = await this.prisma.message.create({
      data: {
        senderId,
        receiverId,
        content,
        messageId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
      include: {
        sender: {
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

    // Process payment only if sender is a USER
    if (shouldChargeSender) {
      await this.walletService.processMessagePayment(senderId, receiverId, messageCost);
    }

    return {
      id: message.id,
      messageId: message.messageId,
      content: message.content,
      senderId: message.senderId,
      receiverId: message.receiverId,
      createdAt: message.createdAt,
      sender: message.sender,
      receiver: message.receiver,
      charged: shouldChargeSender,
    };
  }

  async getMessages(userId: string, partnerId: string, limit: number = 50): Promise<any> {
    const messages = await this.prisma.message.findMany({
      where: {
        OR: [
          { senderId: userId, receiverId: partnerId },
          { senderId: partnerId, receiverId: userId },
        ],
        expiresAt: {
          gt: new Date(),
        },
      },
      include: {
        sender: {
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
      take: limit,
    });

    return messages.reverse().map(message => ({
      id: message.id,
      messageId: message.messageId,
      content: message.content,
      senderId: message.senderId,
      receiverId: message.receiverId,
      createdAt: message.createdAt,
      sender: message.sender,
      receiver: message.receiver,
      isOwn: message.senderId === userId,
    }));
  }

  async getConversations(userId: string): Promise<any> {
    // Get all messages where user is sender or receiver
    const messages = await this.prisma.message.findMany({
      where: {
        OR: [
          { senderId: userId },
          { receiverId: userId },
        ],
        expiresAt: {
          gt: new Date(),
        },
      },
      include: {
        sender: {
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

    // Group by conversation partner
    const conversationMap = new Map();
    
    messages.forEach(message => {
      const partnerId = message.senderId === userId ? message.receiverId : message.senderId;
      const partner = message.senderId === userId ? message.receiver : message.sender;
      
      if (!conversationMap.has(partnerId)) {
        conversationMap.set(partnerId, {
          partnerId,
          partner,
          lastMessage: message,
          messageCount: 1,
        });
      } else {
        const existing = conversationMap.get(partnerId);
        existing.messageCount++;
        if (message.createdAt > existing.lastMessage.createdAt) {
          existing.lastMessage = message;
        }
      }
    });

    return Array.from(conversationMap.values()).map(conversation => ({
      partnerId: conversation.partnerId,
      partner: conversation.partner,
      lastMessage: {
        id: conversation.lastMessage.id,
        content: conversation.lastMessage.content,
        createdAt: conversation.lastMessage.createdAt,
        isOwn: conversation.lastMessage.senderId === userId,
      },
      messageCount: conversation.messageCount,
    }));
  }

  async getAvailableUsers(userId: string): Promise<any> {
    const users = await this.prisma.user.findMany({
      where: {
        id: {
          not: userId,
        },
        isActive: true,
      },
      select: {
        id: true,
        username: true,
        displayName: true,
        role: true,
        isActive: true,
      },
      orderBy: {
        username: 'asc',
      },
    });

    return users;
  }

  async getChatStats(userId: string): Promise<any> {
    // Get total message count
    const totalMessages = await this.prisma.message.count({
      where: {
        OR: [
          { senderId: userId },
          { receiverId: userId },
        ],
      },
    });

    // Get message count by role (sent vs received)
    const sentCount = await this.prisma.message.count({
      where: { senderId: userId },
    });

    const receivedCount = await this.prisma.message.count({
      where: { receiverId: userId },
    });

    return {
      totalMessages,
      sentCount,
      receivedCount,
      totalSpent: sentCount * 100, // ₹1.00 per message
      totalEarned: receivedCount * 90, // ₹0.90 per message (90% of ₹1.00)
    };
  }
} 