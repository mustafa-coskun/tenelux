// Database configuration interfaces and types

export type DatabaseType = 'sqlite' | 'postgresql' | 'mongodb';

export interface DatabaseConfig {
  type: DatabaseType;
  host?: string;
  port?: number;
  database: string;
  username?: string;
  password?: string;
  ssl?: boolean;
  poolSize?: number;
  timeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
}

export interface LoggingConfig {
  level: 'debug' | 'info' | 'warn' | 'error';
  console: boolean;
  file: boolean;
  structured?: boolean;
  maxFileSize?: string;
  maxFiles?: number;
}

export interface SecurityConfig {
  rateLimit: boolean;
  rateLimitWindowMs?: number;
  rateLimitMaxRequests?: number;
  cors: string[];
  bcryptRounds?: number;
  sessionTimeout?: number;
  maxLoginAttempts?: number;
  lockoutDuration?: number;
}

export interface EnvironmentConfig {
  database: DatabaseConfig;
  logging: LoggingConfig;
  security: SecurityConfig;
  isDevelopment: boolean;
  isProduction: boolean;
  isTesting: boolean;
}

// Development configuration
export const developmentConfig: EnvironmentConfig = {
  database: {
    type: 'sqlite',
    database: './data/tenebris-dev.db',
    poolSize: 5,
    timeout: 30000,
    retryAttempts: 3,
    retryDelay: 1000
  },
  logging: {
    level: 'debug',
    console: true,
    file: false,
    structured: false
  },
  security: {
    rateLimit: false,
    cors: ['http://localhost:3000', 'http://127.0.0.1:3000'],
    bcryptRounds: 10,
    sessionTimeout: 24 * 60 * 60 * 1000, // 24 hours
    maxLoginAttempts: 10,
    lockoutDuration: 15 * 60 * 1000 // 15 minutes
  },
  isDevelopment: true,
  isProduction: false,
  isTesting: false
};

// Production configuration
export const productionConfig: EnvironmentConfig = {
  database: {
    type: (process.env.DB_TYPE as DatabaseType) || 'sqlite',
    host: process.env.DB_HOST,
    port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : undefined,
    database: process.env.DB_NAME || './data/tenebris-prod.db',
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: process.env.DB_SSL === 'true',
    poolSize: process.env.DB_POOL_SIZE ? parseInt(process.env.DB_POOL_SIZE) : 20,
    timeout: process.env.DB_TIMEOUT ? parseInt(process.env.DB_TIMEOUT) : 30000,
    retryAttempts: 3,
    retryDelay: 2000
  },
  logging: {
    level: (process.env.LOG_LEVEL as any) || 'info',
    console: false,
    file: true,
    structured: true,
    maxFileSize: '10m',
    maxFiles: 5
  },
  security: {
    rateLimit: true,
    rateLimitWindowMs: 15 * 60 * 1000, // 15 minutes
    rateLimitMaxRequests: 100,
    cors: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : [],
    bcryptRounds: 12,
    sessionTimeout: 4 * 60 * 60 * 1000, // 4 hours
    maxLoginAttempts: 5,
    lockoutDuration: 30 * 60 * 1000 // 30 minutes
  },
  isDevelopment: false,
  isProduction: true,
  isTesting: false
};

// Test configuration
export const testConfig: EnvironmentConfig = {
  database: {
    type: 'sqlite',
    database: ':memory:',
    poolSize: 1,
    timeout: 5000,
    retryAttempts: 1,
    retryDelay: 100
  },
  logging: {
    level: 'error',
    console: false,
    file: false,
    structured: false
  },
  security: {
    rateLimit: false,
    cors: ['http://localhost:3000'],
    bcryptRounds: 4, // Faster for tests
    sessionTimeout: 60 * 60 * 1000, // 1 hour
    maxLoginAttempts: 3,
    lockoutDuration: 5 * 60 * 1000 // 5 minutes
  },
  isDevelopment: false,
  isProduction: false,
  isTesting: true
};

// Configuration factory
export function getConfig(): EnvironmentConfig {
  const nodeEnv = process.env.NODE_ENV || 'development';
  
  switch (nodeEnv) {
    case 'production':
      return productionConfig;
    case 'test':
      return testConfig;
    case 'development':
    default:
      return developmentConfig;
  }
}

// Configuration validation
export function validateConfig(config: EnvironmentConfig): string[] {
  const errors: string[] = [];
  
  // Database validation
  if (!config.database.database) {
    errors.push('Database name is required');
  }
  
  if (config.database.type === 'postgresql' || config.database.type === 'mongodb') {
    if (!config.database.host) {
      errors.push('Database host is required for PostgreSQL/MongoDB');
    }
    if (!config.database.username) {
      errors.push('Database username is required for PostgreSQL/MongoDB');
    }
    if (!config.database.password) {
      errors.push('Database password is required for PostgreSQL/MongoDB');
    }
  }
  
  // Security validation
  if (config.isProduction && config.security.cors.length === 0) {
    errors.push('CORS origins must be specified in production');
  }
  
  if (config.security.bcryptRounds && (config.security.bcryptRounds < 4 || config.security.bcryptRounds > 15)) {
    errors.push('Bcrypt rounds must be between 4 and 15');
  }
  
  return errors;
}