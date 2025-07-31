import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return 'Welcome to Agora Real-Time Monetized Communication Platform API! 🚀';
  }
} 