import { Module } from '@nestjs/common';
import { CallController } from './call.controller';
import { CallService } from './call.service';
import { CallGateway } from './call.gateway';
import { AgoraModule } from '../agora/agora.module';
import { WalletModule } from '../wallet/wallet.module';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [AgoraModule, WalletModule, BillingModule],
  controllers: [CallController],
  providers: [CallService, CallGateway],
  exports: [CallService],
})
export class CallModule {} 