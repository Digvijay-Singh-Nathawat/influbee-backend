import { Controller, Get, Post } from '@nestjs/common';
import { AppService } from './app.service';
import { PrismaService } from './prisma/prisma.service';
import { UserRole, AccountType } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  healthCheck() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
    };
  }

  @Post('setup')
  async setupTestData() {
    try {
      // Check if users already exist
      const existingUser = await this.prisma.user.findFirst();
      if (existingUser) {
        return { message: 'Test data already exists' };
      }

      // Create test users
      const hashedPassword = await bcrypt.hash('password123', 10);

      const testUser = await this.prisma.user.create({
        data: {
          email: 'testuser@example.com',
          username: 'testuser',
          password: hashedPassword,
          role: UserRole.USER,
          displayName: 'Test User',
        },
      });

      const testInfluencer = await this.prisma.user.create({
        data: {
          email: 'testinfluencer@example.com',
          username: 'testinfluencer',
          password: hashedPassword,
          role: UserRole.INFLUENCER,
          displayName: 'Test Influencer',
        },
      });

      // Create user wallet accounts
      await this.prisma.account.create({
        data: {
          userId: testUser.id,
          accountType: AccountType.USER_WALLET,
          balance: 10000, // ₹10,000 starting balance
        },
      });

      await this.prisma.account.create({
        data: {
          userId: testInfluencer.id,
          accountType: AccountType.INFLUENCER_WALLET,
          balance: 0, // Influencers start with 0
        },
      });

      return {
        message: 'Test data created successfully',
        users: [
          { 
            id: testUser.id, 
            username: 'testuser', 
            role: 'USER', 
            email: 'testuser@example.com',
            password: 'password123'
          },
          { 
            id: testInfluencer.id, 
            username: 'testinfluencer', 
            role: 'INFLUENCER', 
            email: 'testinfluencer@example.com',
            password: 'password123'
          }
        ],
        info: 'Use these credentials to login on the frontend'
      };
    } catch (error) {
      return { error: 'Failed to create test data', details: error.message };
    }
  }
} 