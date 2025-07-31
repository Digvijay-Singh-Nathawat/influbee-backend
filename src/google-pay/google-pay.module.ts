import { Module, forwardRef } from '@nestjs/common';
import { GooglePayController } from './google-pay.controller';
import { GooglePayService } from './google-pay.service';
import { WalletModule } from '../wallet/wallet.module';

@Module({
  imports: [forwardRef(() => WalletModule)],
  controllers: [GooglePayController],
  providers: [GooglePayService],
  exports: [GooglePayService],
})
export class GooglePayModule {} 