import { IsNotEmpty, IsString, IsEnum, IsOptional, IsNumber, Min } from 'class-validator';

export enum AgoraTokenType {
  RTC = 'rtc',
  RTM = 'rtm',
}

export class GenerateTokenDto {
  @IsString()
  @IsNotEmpty()
  channelName: string;

  @IsEnum(AgoraTokenType)
  tokenType: AgoraTokenType = AgoraTokenType.RTC;

  @IsNumber()
  @IsOptional()
  @Min(1)
  expirationInSeconds?: number = 3600; // 1 hour default

  @IsString()
  @IsOptional()
  role?: string = 'publisher'; // publisher or subscriber
} 