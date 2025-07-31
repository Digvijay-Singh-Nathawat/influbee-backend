import { Module, forwardRef } from '@nestjs/common';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';
import { WalletGateway } from './wallet.gateway';
import { GooglePayModule } from '../google-pay/google-pay.module';

@Module({
  imports: [forwardRef(() => GooglePayModule)],
  controllers: [WalletController],
  providers: [WalletService, WalletGateway],
  exports: [WalletService, WalletGateway],
})
export class WalletModule {} 