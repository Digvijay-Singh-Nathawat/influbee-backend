import { Controller, Get, Post, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { GooglePayService } from './google-pay.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';

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

@Controller('google-pay')
export class GooglePayController {
  constructor(private readonly googlePayService: GooglePayService) {}

  @Get('config')
  @Public()
  async getGooglePayConfig() {
    const config = this.googlePayService.getGooglePayConfig();
    return {
      success: true,
      data: config,
      message: 'Google Pay configuration retrieved successfully',
    };
  }

  @Get('payment-methods')
  @Public()
  async getSupportedPaymentMethods() {
    const methods = this.googlePayService.getSupportedPaymentMethods();
    return {
      success: true,
      data: methods,
      message: 'Supported payment methods retrieved successfully',
    };
  }

  @Post('create-payment-data')
  @UseGuards(JwtAuthGuard)
  async createPaymentData(@Body() body: { amount: number; currency?: string }) {
    const { amount, currency = 'INR' } = body;
    
    const paymentData = this.googlePayService.createPaymentData(amount, currency);
    
    return {
      success: true,
      data: paymentData,
      message: 'Payment data created successfully',
    };
  }

  @Post('process-payment')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async processPayment(
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
        message: 'Payment processed successfully',
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: 'Payment processing failed',
      };
    }
  }

  @Post('process-withdrawal')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async processWithdrawal(
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