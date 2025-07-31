import { Injectable, ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { UserRole, AccountType } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

export interface JwtPayload {
  sub: string;
  username: string;
  role: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(registerDto: RegisterDto) {
    const { email, username, password, role = UserRole.USER, displayName } = registerDto;

    // Check if user exists
    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [{ email }, { username }],
      },
    });

    if (existingUser) {
      throw new ConflictException('User with this email or username already exists');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user and wallet in transaction
    const result = await this.prisma.$transaction(async (tx) => {
      // Create user
      const user = await tx.user.create({
        data: {
          email,
          username,
          password: hashedPassword,
          role,
          displayName: displayName || username,
        },
      });

      // Create wallet account
      await tx.account.create({
        data: {
          userId: user.id,
          accountType: role === UserRole.INFLUENCER ? AccountType.INFLUENCER_WALLET : AccountType.USER_WALLET,
          balance: role === UserRole.USER ? 10000 : 0, // Users get ₹10,000, influencers get ₹0
        },
      });

      return user;
    });

    // Generate tokens
    const payload: JwtPayload = {
      sub: result.id,
      username: result.username,
      role: result.role,
    };

    const access_token = this.jwtService.sign(payload);

    return {
      user: {
        id: result.id,
        email: result.email,
        username: result.username,
        role: result.role,
        displayName: result.displayName,
      },
      access_token,
    };
  }

  async login(loginDto: LoginDto) {
    const { username, password } = loginDto;

    // Find user
    const user = await this.prisma.user.findUnique({
      where: { username },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Generate tokens
    const payload: JwtPayload = {
      sub: user.id,
      username: user.username,
      role: user.role,
    };

    const access_token = this.jwtService.sign(payload);

    return {
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
        displayName: user.displayName,
      },
      access_token,
    };
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        displayName: true,
        avatar: true,
        isActive: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Get wallet balance
    const account = await this.prisma.account.findFirst({
      where: { userId },
    });

    return {
      ...user,
      balance: account?.balance.toNumber() || 0,
    };
  }
} 