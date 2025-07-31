import { IsNotEmpty, IsNumber, IsString, IsOptional, Min } from 'class-validator';

export class TransferDto {
  @IsString()
  @IsNotEmpty()
  recipientId: string;

  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsString()
  @IsOptional()
  description?: string;
}

export class TopUpDto {
  @IsNumber()
  @Min(1)
  amount: number;

  @IsString()
  @IsNotEmpty()
  paymentToken: string;

  @IsString()
  @IsOptional()
  paymentMethod?: string;
} 