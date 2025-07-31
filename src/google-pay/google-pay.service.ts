import { Injectable, Logger, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';

export interface GooglePayPaymentData {
  apiVersion: number;
  apiVersionMinor: number;
  allowedPaymentMethods: any[];
  merchantInfo: {
    merchantId: string;
    merchantName: string;
  };
  transactionInfo: {
    totalPriceStatus: string;
    totalPrice: string;
    currencyCode: string;
    countryCode: string;
  };
}

export interface PaymentResponse {
  paymentMethodData: {
    tokenizationData: {
      token: string;
      type: string;
    };
    description: string;
    info: any;
    type: string;
  };
}

@Injectable()
export class GooglePayService {
  private readonly logger = new Logger(GooglePayService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => WalletService))
    private readonly walletService: WalletService,
  ) {}

  /**
   * Get Google Pay configuration for frontend
   */
  getGooglePayConfig(): any {
    const environment = this.configService.get<string>('GOOGLE_PAY_ENVIRONMENT') || 'TEST';
    const merchantId = this.configService.get<string>('GOOGLE_PAY_MERCHANT_ID');
    const merchantName = this.configService.get<string>('GOOGLE_PAY_MERCHANT_NAME');
    const gatewayMerchantId = this.configService.get<string>('GOOGLE_PAY_GATEWAY_MERCHANT_ID');
    const gateway = this.configService.get<string>('GOOGLE_PAY_GATEWAY');

    return {
      environment,
      merchantId,
      merchantName,
      gatewayMerchantId,
      gateway,
      apiVersion: 2,
      apiVersionMinor: 0,
      allowedPaymentMethods: [
        {
          type: 'CARD',
          parameters: {
            allowedAuthMethods: ['PAN_ONLY', 'CRYPTOGRAM_3DS'],
            allowedCardNetworks: ['VISA', 'MASTERCARD', 'AMEX'],
          },
          tokenizationSpecification: {
            type: 'PAYMENT_GATEWAY',
            parameters: {
              gateway: gateway || 'example',
              gatewayMerchantId: gatewayMerchantId || 'gatewayMerchantId',
            },
          },
        },
      ],
    };
  }

  /**
   * Create payment data for Google Pay
   */
  createPaymentData(amount: number, currency: string = 'INR'): GooglePayPaymentData {
    const config = this.getGooglePayConfig();
    
    return {
      apiVersion: config.apiVersion,
      apiVersionMinor: config.apiVersionMinor,
      allowedPaymentMethods: config.allowedPaymentMethods,
      merchantInfo: {
        merchantId: config.merchantId || 'BCR2DN6T7PO4XAJG',
        merchantName: config.merchantName || 'Agora Communication Platform',
      },
      transactionInfo: {
        totalPriceStatus: 'FINAL',
        totalPrice: (amount / 100).toFixed(2), // Convert paisa to rupees
        currencyCode: currency,
        countryCode: 'IN',
      },
    };
  }

  /**
   * Process payment after Google Pay success
   */
  async processPayment(
    userId: string,
    amount: number,
    paymentData: PaymentResponse,
    paymentMethod: string = 'GOOGLE_PAY',
  ): Promise<any> {
    try {
      this.logger.log(`Processing payment for user ${userId}, amount: ${amount}`);

      // Validate payment amount
      const minAmount = this.configService.get<number>('MIN_TOPUP_AMOUNT') || 10000;
      if (amount < minAmount) {
        throw new BadRequestException(`Minimum top-up amount is ₹${minAmount / 100}`);
      }

      // In real implementation, verify payment with payment gateway
      const paymentVerified = await this.verifyPaymentWithGateway(paymentData);
      
      if (!paymentVerified) {
        throw new BadRequestException('Payment verification failed');
      }

      // Create transaction record
      const transaction = await this.prisma.transaction.create({
        data: {
          type: 'TOP_UP',
          status: 'COMPLETED',
          userId,
          amount: amount,
          metadata: {
            paymentMethod,
            paymentData: {
              description: paymentData.paymentMethodData.description,
              type: paymentData.paymentMethodData.type,
            },
            gateway: this.configService.get<string>('GOOGLE_PAY_GATEWAY'),
          },
        },
      });

      // Add money to user's wallet
      await this.addMoneyToWallet(userId, amount, transaction.id);

      this.logger.log(`Payment processed successfully for user ${userId}, transaction: ${transaction.id}`);

      return {
        success: true,
        transactionId: transaction.id,
        amount: amount,
        currency: 'INR',
        message: 'Payment processed successfully',
      };
    } catch (error) {
      this.logger.error(`Payment processing failed for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Add money to user's wallet
   */
  private async addMoneyToWallet(userId: string, amount: number, transactionId: string): Promise<void> {
    try {
      await this.prisma.$transaction(async (prisma) => {
        // Get or create user's wallet account
        let userAccount = await prisma.account.findFirst({
          where: { userId, accountType: 'USER_WALLET' },
        });

        if (!userAccount) {
          userAccount = await prisma.account.create({
            data: {
              userId,
              accountType: 'USER_WALLET',
              currency: 'INR',
              balance: 0,
            },
          });
        }

        // Create accounting entry
        await prisma.entry.create({
          data: {
            transactionId,
            accountId: userAccount.id,
            amount: amount,
            direction: 'CREDIT',
          },
        });

        // Update account balance
        await prisma.account.update({
          where: { id: userAccount.id },
          data: { balance: { increment: amount } },
        });
      });

      this.logger.log(`Money added to wallet for user ${userId}, amount: ${amount}`);
    } catch (error) {
      this.logger.error(`Failed to add money to wallet for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Process withdrawal request
   */
  async processWithdrawal(
    userId: string,
    amount: number,
    withdrawalMethod: string,
    bankDetails?: any,
  ): Promise<any> {
    try {
      this.logger.log(`Processing withdrawal for user ${userId}, amount: ${amount}`);

      // Validate withdrawal amount
      const minAmount = this.configService.get<number>('MIN_WITHDRAWAL_AMOUNT') || 50000;
      const maxAmount = this.configService.get<number>('MAX_WITHDRAWAL_AMOUNT') || 10000000;
      
      if (amount < minAmount) {
        throw new BadRequestException(`Minimum withdrawal amount is ₹${minAmount / 100}`);
      }
      
      if (amount > maxAmount) {
        throw new BadRequestException(`Maximum withdrawal amount is ₹${maxAmount / 100}`);
      }

      // Check user balance
      const userBalance = await this.walletService.getBalance(userId);
      if (userBalance < amount) {
        throw new BadRequestException('Insufficient balance for withdrawal');
      }

      // Create withdrawal transaction
      const transaction = await this.prisma.transaction.create({
        data: {
          type: 'WITHDRAWAL',
          status: 'PENDING',
          userId,
          amount: amount,
          metadata: {
            withdrawalMethod,
            bankDetails: bankDetails || {},
          },
        },
      });

      // Deduct money from user's wallet
      await this.deductMoneyFromWallet(userId, amount, transaction.id);

      // In real implementation, initiate withdrawal with payment gateway
      // For now, we'll mark as completed
      await this.prisma.transaction.update({
        where: { id: transaction.id },
        data: { status: 'COMPLETED' },
      });

      this.logger.log(`Withdrawal processed successfully for user ${userId}, transaction: ${transaction.id}`);

      return {
        success: true,
        transactionId: transaction.id,
        amount: amount,
        currency: 'INR',
        status: 'COMPLETED',
        message: 'Withdrawal processed successfully',
      };
    } catch (error) {
      this.logger.error(`Withdrawal processing failed for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Deduct money from user's wallet
   */
  private async deductMoneyFromWallet(userId: string, amount: number, transactionId: string): Promise<void> {
    try {
      await this.prisma.$transaction(async (prisma) => {
        // Get user's wallet account
        const userAccount = await prisma.account.findFirst({
          where: { userId, accountType: 'USER_WALLET' },
        });

        if (!userAccount) {
          throw new BadRequestException('User wallet not found');
        }

        // Create accounting entry
        await prisma.entry.create({
          data: {
            transactionId,
            accountId: userAccount.id,
            amount: amount,
            direction: 'DEBIT',
          },
        });

        // Update account balance
        await prisma.account.update({
          where: { id: userAccount.id },
          data: { balance: { decrement: amount } },
        });
      });

      this.logger.log(`Money deducted from wallet for user ${userId}, amount: ${amount}`);
    } catch (error) {
      this.logger.error(`Failed to deduct money from wallet for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Verify payment with payment gateway (mock implementation)
   */
  private async verifyPaymentWithGateway(paymentData: PaymentResponse): Promise<boolean> {
    // In real implementation, you would:
    // 1. Decrypt the payment token
    // 2. Verify with the payment gateway
    // 3. Check payment status
    
    this.logger.log('Verifying payment with gateway...');
    
    // Mock verification - in TEST mode, always return true
    const environment = this.configService.get<string>('GOOGLE_PAY_ENVIRONMENT');
    if (environment === 'TEST') {
      return true;
    }

    // In production, implement actual verification
    try {
      // Add your payment gateway verification logic here
      return true;
    } catch (error) {
      this.logger.error('Payment verification failed:', error);
      return false;
    }
  }

  /**
   * Get supported payment methods
   */
  getSupportedPaymentMethods(): any[] {
    return [
      {
        type: 'GOOGLE_PAY',
        name: 'Google Pay',
        description: 'Pay with Google Pay',
        icon: 'google-pay-icon',
        enabled: true,
      },
      {
        type: 'CARD',
        name: 'Credit/Debit Card',
        description: 'Visa, MasterCard, American Express',
        icon: 'card-icon',
        enabled: true,
      },
      {
        type: 'UPI',
        name: 'UPI',
        description: 'Pay with UPI',
        icon: 'upi-icon',
        enabled: true,
      },
    ];
  }
} 