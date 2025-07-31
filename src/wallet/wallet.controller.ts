import { Controller, Get, Post, Body, UseGuards, HttpCode, HttpStatus, Inject, forwardRef } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { GooglePayService } from '../google-pay/google-pay.service';

export class AddMoneyDto {
  amount: number;
  paymentData: any;
  paymentMethod?: string;
}

export class WithdrawMoneyDto {
  amount: number;
  withdrawalMethod: string;
  bankDetails?: {
    accountNumber?: string;
    ifscCode?: string;
    accountHolderName?: string;
    bankName?: string;
  };
}

@Controller('wallet')
@UseGuards(JwtAuthGuard)
export class WalletController {
  constructor(
    private readonly walletService: WalletService,
    @Inject(forwardRef(() => GooglePayService))
    private readonly googlePayService: GooglePayService,
  ) {}

  @Get('balance')
  async getBalance(@CurrentUser() user: any) {
    const balance = await this.walletService.getBalance(user.id);
    return {
      balance: Math.round(balance), // Ensure balance is returned as integer (paisa)
      currency: 'INR',
    };
  }

  @Get('transactions')
  async getTransactions(@CurrentUser() user: any) {
    const transactions = await this.walletService.getTransactions(user.id);
    return {
      transactions,
    };
  }

  @Post('add-money')
  @HttpCode(HttpStatus.OK)
  async addMoney(
    @CurrentUser() user: any,
    @Body() addMoneyDto: AddMoneyDto,
  ) {
    const { amount, paymentData, paymentMethod = 'GOOGLE_PAY' } = addMoneyDto;

    try {
      const result = await this.googlePayService.processPayment(
        user.id,
        amount,
        paymentData,
        paymentMethod,
      );

      return {
        success: true,
        data: result,
        message: 'Money added successfully',
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: 'Failed to add money',
      };
    }
  }

  @Post('withdrawal')
  @HttpCode(HttpStatus.OK)
  async withdrawal(
    @CurrentUser() user: any,
    @Body() withdrawMoneyDto: WithdrawMoneyDto,
  ) {
    const { amount, withdrawalMethod, bankDetails } = withdrawMoneyDto;

    try {
      const result = await this.googlePayService.processWithdrawal(
        user.id,
        amount,
        withdrawalMethod,
        bankDetails,
      );

      return {
        success: true,
        data: result,
        message: 'Withdrawal processed successfully',
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: 'Withdrawal processing failed',
      };
    }
  }
} 