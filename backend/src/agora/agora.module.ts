import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AgoraController } from './agora.controller';
import { AgoraService } from './agora.service';

@Module({
  imports: [ConfigModule],
  controllers: [AgoraController],
  providers: [AgoraService],
  exports: [AgoraService],
})
export class AgoraModule {} 