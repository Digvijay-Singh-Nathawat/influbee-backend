import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';

// Core modules
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { WalletModule } from './wallet/wallet.module';
import { ChatModule } from './chat/chat.module';
import { BillingModule } from './billing/billing.module';
import { AgoraModule } from './agora/agora.module';
import { CallModule } from './call/call.module';
import { GooglePayModule } from './google-pay/google-pay.module';

// Controllers
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    
    // Core NestJS modules
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),
    
    // Application modules
    PrismaModule,
    AuthModule,
    WalletModule,
    ChatModule,
    BillingModule,
    AgoraModule,
    CallModule,
    GooglePayModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {} 