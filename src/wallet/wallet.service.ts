import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AccountType, TransactionType, TransactionStatus, EntryDirection } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { WalletGateway } from './wallet.gateway';

@Injectable()
export class WalletService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly walletGateway: WalletGateway,
  ) {}

  async getBalance(userId: string): Promise<number> {
    const account = await this.prisma.account.findFirst({
      where: { userId },
    });
    return account?.balance.toNumber() || 0;
  }

  async getTransactions(userId: string, limit: number = 50) {
    const transactions = await this.prisma.transaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        entries: {
          include: {
            account: true,
          },
        },
      },
    });

    return transactions.map(tx => ({
      id: tx.id,
      type: tx.type,
      status: tx.status,
      amount: tx.amount.toNumber(),
      metadata: tx.metadata,
      createdAt: tx.createdAt,
      entries: tx.entries.map(entry => ({
        id: entry.id,
        amount: entry.amount.toNumber(),
        direction: entry.direction,
        accountType: entry.account.accountType,
      })),
    }));
  }

  async processMessageCharge(senderId: string, receiverId: string, messageId: string) {
    const MESSAGE_CHARGE = 100;

    return this.prisma.$transaction(async (tx) => {
      // Get sender's account
      const senderAccount = await tx.account.findFirst({
        where: { userId: senderId },
      });

      if (!senderAccount || senderAccount.balance.toNumber() < MESSAGE_CHARGE) {
        throw new BadRequestException('Insufficient balance for message');
      }

      // Get receiver's account
      const receiverAccount = await tx.account.findFirst({
        where: { userId: receiverId },
      });

      if (!receiverAccount) {
        throw new BadRequestException('Receiver account not found');
      }

      // Create transaction
      const transaction = await tx.transaction.create({
        data: {
          type: TransactionType.CHAT_PAYMENT,
          status: TransactionStatus.COMPLETED,
          amount: MESSAGE_CHARGE,
          userId: senderId,
          referenceId: messageId,
          metadata: {
            senderId,
            receiverId,
            messageId,
          },
        },
      });

      // Create entries
      await tx.entry.createMany({
        data: [
          {
            transactionId: transaction.id,
            accountId: senderAccount.id,
            amount: MESSAGE_CHARGE,
            direction: EntryDirection.DEBIT,
          },
          {
            transactionId: transaction.id,
            accountId: receiverAccount.id,
            amount: MESSAGE_CHARGE,
            direction: EntryDirection.CREDIT,
          },
        ],
      });

      // Update balances
      await tx.account.update({
        where: { id: senderAccount.id },
        data: { balance: { decrement: MESSAGE_CHARGE } },
      });

      await tx.account.update({
        where: { id: receiverAccount.id },
        data: { balance: { increment: MESSAGE_CHARGE } },
      });

      return transaction;
    });
  }

  async holdFundsForCall(userId: string, estimatedAmount: number, callId: string) {
    return this.prisma.$transaction(async (tx) => {
      const userAccount = await tx.account.findFirst({
        where: { userId },
      });

      if (!userAccount || userAccount.balance.toNumber() < estimatedAmount) {
        throw new BadRequestException('Insufficient balance for call');
      }

      // Create hold transaction
      const transaction = await tx.transaction.create({
        data: {
          type: TransactionType.HOLD_FUNDS,
          status: TransactionStatus.HELD,
          amount: estimatedAmount,
          userId,
          referenceId: callId,
          metadata: { 
            callId,
            estimatedAmount,
          },
        },
      });

      // Deduct from user balance
      await tx.account.update({
        where: { id: userAccount.id },
        data: { balance: { decrement: estimatedAmount } },
      });

      return transaction;
    });
  }

  async settleCallCharges(
    callId: string,
    actualDuration: number,
    callType: 'VOICE' | 'VIDEO',
    callerId: string,
    receiverId: string,
  ) {
    const ratePerMinute = callType === 'VIDEO' ? 500 : 350;
    const actualCharge = Math.ceil(actualDuration / 60) * ratePerMinute;

    return this.prisma.$transaction(async (tx) => {
      // Get receiver's account
      const receiverAccount = await tx.account.findFirst({
        where: { userId: receiverId },
      });

      if (!receiverAccount) {
        throw new BadRequestException('Receiver account not found');
      }

      // Create settlement transaction
      const transaction = await tx.transaction.create({
        data: {
          type: TransactionType.CALL_PAYMENT,
          status: TransactionStatus.COMPLETED,
          amount: actualCharge,
          userId: callerId,
          referenceId: callId,
          metadata: {
            callId,
            actualDuration,
            callType,
            receiverId,
          },
        },
      });

      // Add to receiver's balance
      await tx.account.update({
        where: { id: receiverAccount.id },
        data: { balance: { increment: actualCharge } },
      });

      return transaction;
    });
  }

  async refundHeldFunds(callId: string, userId: string, refundAmount: number) {
    return this.prisma.$transaction(async (tx) => {
      // Get user's account
      const userAccount = await tx.account.findFirst({
        where: { userId },
      });

      if (!userAccount) {
        throw new BadRequestException('User account not found');
      }

      // Create refund transaction
      const transaction = await tx.transaction.create({
        data: {
          type: TransactionType.REFUND,
          status: TransactionStatus.COMPLETED,
          amount: refundAmount,
          userId,
          referenceId: callId,
          metadata: {
            callId,
            reason: 'Call cancellation or early termination',
          },
        },
      });

      // Add refund back to user's balance
      await tx.account.update({
        where: { id: userAccount.id },
        data: { balance: { increment: refundAmount } },
      });

      return transaction;
    });
  }

  /**
   * Process message payment
   */
  async processMessagePayment(
    senderId: string,
    receiverId: string,
    amount: number,
  ): Promise<void> {
    const transactionId = `msg_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    try {
      await this.prisma.$transaction(async (prisma) => {
        // Get accounts
        const [senderAccount, receiverAccount, revenueAccount] = await Promise.all([
          prisma.account.findFirst({
            where: { userId: senderId, accountType: 'USER_WALLET' },
          }),
          prisma.account.findFirst({
            where: { userId: receiverId, accountType: 'USER_WALLET' },
          }),
          prisma.account.findFirst({
            where: { accountType: 'REVENUE' },
          }),
        ]);

        if (!senderAccount || !receiverAccount || !revenueAccount) {
          throw new Error('Required accounts not found');
        }

        // Check sender balance
        if (Number(senderAccount.balance) < amount) {
          throw new Error('Insufficient balance');
        }

        // Calculate amounts (90% to receiver, 10% to revenue)
        const receiverAmount = Math.floor(amount * 0.9);
        const revenueAmount = amount - receiverAmount;

        // Create transaction record
        const transaction = await prisma.transaction.create({
          data: {
            idempotencyKey: transactionId,
            type: 'CHAT_PAYMENT',
            status: 'COMPLETED',
            userId: senderId,
            amount: amount,
            metadata: {
              receiverId,
              receiverAmount,
              revenueAmount,
            },
          },
        });

        // Create entries for double-entry bookkeeping
        await Promise.all([
          // Debit sender
          prisma.entry.create({
            data: {
              transactionId: transaction.id,
              accountId: senderAccount.id,
              amount: amount,
              direction: 'DEBIT',
            },
          }),
          // Credit receiver
          prisma.entry.create({
            data: {
              transactionId: transaction.id,
              accountId: receiverAccount.id,
              amount: receiverAmount,
              direction: 'CREDIT',
            },
          }),
          // Credit revenue
          prisma.entry.create({
            data: {
              transactionId: transaction.id,
              accountId: revenueAccount.id,
              amount: revenueAmount,
              direction: 'CREDIT',
            },
          }),
        ]);

        // Update account balances
        await Promise.all([
          prisma.account.update({
            where: { id: senderAccount.id },
            data: { balance: { decrement: amount } },
          }),
          prisma.account.update({
            where: { id: receiverAccount.id },
            data: { balance: { increment: receiverAmount } },
          }),
          prisma.account.update({
            where: { id: revenueAccount.id },
            data: { balance: { increment: revenueAmount } },
          }),
        ]);
      });

      // Emit real-time balance updates
      const [updatedSenderBalance, updatedReceiverBalance] = await Promise.all([
        this.getBalance(senderId),
        this.getBalance(receiverId),
      ]);

      this.walletGateway.emitBalanceUpdate(senderId, updatedSenderBalance);
      this.walletGateway.emitBalanceUpdate(receiverId, updatedReceiverBalance);

    } catch (error) {
      throw error;
    }
  }

  async processCallPayment(
    initiatorId: string,
    receiverId: string,
    amount: number,
    refundAmount: number = 0,
    callId: string,
  ): Promise<void> {
    const transactionId = `call_${callId}_${Date.now()}`;

    try {
      await this.prisma.$transaction(async (prisma) => {
        // Get accounts
        const [initiatorAccount, receiverAccount, revenueAccount] = await Promise.all([
          prisma.account.findFirst({
            where: { userId: initiatorId, accountType: 'USER_WALLET' },
          }),
          prisma.account.findFirst({
            where: { userId: receiverId, accountType: 'USER_WALLET' },
          }),
          prisma.account.findFirst({
            where: { accountType: 'REVENUE' },
          }),
        ]);

        if (!initiatorAccount || !receiverAccount || !revenueAccount) {
          throw new Error('Required accounts not found');
        }

        // Calculate amounts (90% to receiver, 10% to revenue)
        const receiverAmount = Math.floor(amount * 0.9);
        const revenueAmount = amount - receiverAmount;

        // Create transaction record
        const transaction = await prisma.transaction.create({
          data: {
            idempotencyKey: transactionId,
            type: 'CALL_PAYMENT',
            status: 'COMPLETED',
            userId: initiatorId,
            amount: amount,
            referenceId: callId,
            metadata: {
              receiverId,
              receiverAmount,
              revenueAmount,
              refundAmount,
            },
          },
        });

        // Create entries for double-entry bookkeeping
        await Promise.all([
          // Debit initiator
          prisma.entry.create({
            data: {
              transactionId: transaction.id,
              accountId: initiatorAccount.id,
              amount: amount,
              direction: 'DEBIT',
            },
          }),
          // Credit receiver
          prisma.entry.create({
            data: {
              transactionId: transaction.id,
              accountId: receiverAccount.id,
              amount: receiverAmount,
              direction: 'CREDIT',
            },
          }),
          // Credit revenue
          prisma.entry.create({
            data: {
              transactionId: transaction.id,
              accountId: revenueAccount.id,
              amount: revenueAmount,
              direction: 'CREDIT',
            },
          }),
        ]);

        // Update account balances
        await Promise.all([
          prisma.account.update({
            where: { id: initiatorAccount.id },
            data: { balance: { decrement: amount } },
          }),
          prisma.account.update({
            where: { id: receiverAccount.id },
            data: { balance: { increment: receiverAmount } },
          }),
          prisma.account.update({
            where: { id: revenueAccount.id },
            data: { balance: { increment: revenueAmount } },
          }),
        ]);

        // Handle refund if applicable
        if (refundAmount > 0) {
          const refundTransaction = await prisma.transaction.create({
            data: {
              idempotencyKey: `${transactionId}_refund`,
              type: 'REFUND',
              status: 'COMPLETED',
              userId: initiatorId,
              amount: refundAmount,
              referenceId: callId,
              metadata: {
                originalTransactionId: transaction.id,
                reason: 'Early termination',
              },
            },
          });

          await prisma.entry.create({
            data: {
              transactionId: refundTransaction.id,
              accountId: initiatorAccount.id,
              amount: refundAmount,
              direction: 'CREDIT',
            },
          });

          await prisma.account.update({
            where: { id: initiatorAccount.id },
            data: { balance: { increment: refundAmount } },
          });
        }
      });

      // Emit real-time balance updates
      const [updatedInitiatorBalance, updatedReceiverBalance] = await Promise.all([
        this.getBalance(initiatorId),
        this.getBalance(receiverId),
      ]);

      this.walletGateway.emitBalanceUpdate(initiatorId, updatedInitiatorBalance);
      this.walletGateway.emitBalanceUpdate(receiverId, updatedReceiverBalance);

    } catch (error) {
      throw error;
    }
  }
} 