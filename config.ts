// Configuration for Agora Backend
// Make sure to set your actual values, especially Agora credentials
declare const process: any;
export const config = {
  // Database Configuration
  database: {
    url: process.env.DATABASE_URL || "postgresql://user:password@localhost:5432/agora_db?schema=public",
  },
  
  // Redis Configuration
  redis: {
    host: process.env.REDIS_HOST || "localhost",
    port: parseInt(process.env.REDIS_PORT || "6379"),
    password: process.env.REDIS_PASSWORD || "",
  },
  
  // JWT Configuration
  jwt: {
    secret: process.env.JWT_SECRET || "your-super-secret-jwt-key-here-change-in-production",
    expiration: process.env.JWT_EXPIRATION || "7d",
  },
  
  // Agora Configuration
  agora: {
    appId: process.env.AGORA_APP_ID || "YOUR_REAL_APP_ID_HERE",
    appCertificate: process.env.AGORA_APP_CERTIFICATE || "YOUR_REAL_APP_CERTIFICATE_HERE", 
    webhookSecret: process.env.AGORA_WEBHOOK_SECRET || "pHxKMJqtM",
  },
  
  // Application Configuration
  app: {
    port: parseInt(process.env.PORT || "3001"),
    nodeEnv: process.env.NODE_ENV || "development",
  },
  
  // Wallet Configuration
  wallet: {
    defaultUserBalance: parseInt(process.env.DEFAULT_USER_BALANCE || "10000"), // INR
  },
  
  // Pricing Configuration (in INR)
  pricing: {
    perMessage: parseInt(process.env.PRICE_PER_MESSAGE || "100"),
    perMinuteVoice: parseInt(process.env.PRICE_PER_MINUTE_VOICE || "350"),
    perMinuteVideo: parseInt(process.env.PRICE_PER_MINUTE_VIDEO || "500"),
  },
}; 