import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { BillingService } from './billing.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@Controller('billing')
@UseGuards(JwtAuthGuard)
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get('pricing')
  async getPricing() {
    const pricing = this.billingService.getPricingInfo();
    return {
      success: true,
      data: pricing,
      message: 'Pricing information retrieved successfully',
    };
  }

  @Post('estimate')
  async estimateCost(@Body() body: { duration: number; callType: 'VOICE' | 'VIDEO' }) {
    const { duration, callType } = body;
    const cost = this.billingService.estimateCallCost(duration, callType);
    
    return {
      success: true,
      data: {
        estimatedCost: cost,
        duration,
        callType,
        currency: 'INR',
      },
      message: 'Cost estimate calculated successfully',
    };
  }
} 