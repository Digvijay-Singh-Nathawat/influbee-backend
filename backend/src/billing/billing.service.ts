import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class BillingService {
  private readonly PRICE_PER_MESSAGE: number;
  private readonly PRICE_PER_MINUTE_VOICE: number;
  private readonly PRICE_PER_MINUTE_VIDEO: number;

  constructor(private readonly configService: ConfigService) {
    this.PRICE_PER_MESSAGE = this.configService.get<number>('PRICE_PER_MESSAGE') || 100;
    this.PRICE_PER_MINUTE_VOICE = this.configService.get<number>('PRICE_PER_MINUTE_VOICE') || 350;
    this.PRICE_PER_MINUTE_VIDEO = this.configService.get<number>('PRICE_PER_MINUTE_VIDEO') || 500;
  }

  getPricingInfo() {
    return {
      message: this.PRICE_PER_MESSAGE,
      voiceCall: this.PRICE_PER_MINUTE_VOICE,
      videoCall: this.PRICE_PER_MINUTE_VIDEO,
      currency: 'INR',
    };
  }

  estimateCallCost(duration: number, callType: 'VOICE' | 'VIDEO'): number {
    const ratePerMinute = callType === 'VIDEO' ? this.PRICE_PER_MINUTE_VIDEO : this.PRICE_PER_MINUTE_VOICE;
    return Math.ceil(duration) * ratePerMinute;
  }

  calculateActualCallCost(durationInSeconds: number, callType: 'VOICE' | 'VIDEO'): number {
    const durationInMinutes = Math.ceil(durationInSeconds / 60);
    const ratePerMinute = callType === 'VIDEO' ? this.PRICE_PER_MINUTE_VIDEO : this.PRICE_PER_MINUTE_VOICE;
    return durationInMinutes * ratePerMinute;
  }
} 