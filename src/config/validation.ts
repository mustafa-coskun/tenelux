// Configuration validation utilities

import { EnvironmentConfig, DatabaseConfig, LoggingConfig, SecurityConfig } from './database';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

// Environment variable validation
export function validateEnvironmentVariables(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  const nodeEnv = process.env.NODE_ENV;
  if (!nodeEnv) {
    warnings.push('NODE_ENV is not set, defaulting to development');
  }
  
  // Production specific validations
  if (nodeEnv === 'production') {
    if (!process.env.DB_TYPE && !process.env.DB_NAME) {
      errors.push('Database configuration is required in production');
    }
    
    if (process.env.DB_TYPE === 'postgresql' || process.env.DB_TYPE === 'mongodb') {
      if (!process.env.DB_HOST) {
        errors.push('DB_HOST is required for PostgreSQL/MongoDB in production');
      }
      if (!process.env.DB_USER) {
        errors.push('DB_USER is required for PostgreSQL/MongoDB in production');
      }
      if (!process.env.DB_PASSWORD) {
        errors.push('DB_PASSWORD is required for PostgreSQL/MongoDB in production');
      }
    }
    
    if (!process.env.ALLOWED_ORIGINS) {
      errors.push('ALLOWED_ORIGINS must be set in production');
    }
    
    if (process.env.LOG_LEVEL && !['error', 'warn', 'info', 'debug'].includes(process.env.LOG_LEVEL)) {
      errors.push('LOG_LEVEL must be one of: error, warn, info, debug');
    }
  }
  
  // Validate numeric environment variables
  const numericVars = ['DB_PORT', 'DB_POOL_SIZE', 'DB_TIMEOUT'];
  for (const varName of numericVars) {
    const value = process.env[varName];
    if (value && isNaN(parseInt(value))) {
      errors.push(`${varName} must be a valid number`);
    }
  }
  
  // Validate boolean environment variables
  const booleanVars = ['DB_SSL'];
  for (const varName of booleanVars) {
    const value = process.env[varName];
    if (value && !['true', 'false'].includes(value.toLowerCase())) {
      errors.push(`${varName} must be 'true' or 'false'`);
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

// Database configuration validation
export function validateDatabaseConfig(config: DatabaseConfig): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Required fields
  if (!config.database) {
    errors.push('Database name is required');
  }
  
  if (!config.type) {
    errors.push('Database type is required');
  } else if (!['sqlite', 'postgresql', 'mongodb'].includes(config.type)) {
    errors.push('Database type must be one of: sqlite, postgresql, mongodb');
  }
  
  // Type-specific validations
  if (config.type === 'postgresql' || config.type === 'mongodb') {
    if (!config.host) {
      errors.push('Database host is required for PostgreSQL/MongoDB');
    }
    if (!config.username) {
      errors.push('Database username is required for PostgreSQL/MongoDB');
    }
    if (!config.password) {
      errors.push('Database password is required for PostgreSQL/MongoDB');
    }
    if (config.port && (config.port < 1 || config.port > 65535)) {
      errors.push('Database port must be between 1 and 65535');
    }
  }
  
  // Pool size validation
  if (config.poolSize && (config.poolSize < 1 || config.poolSize > 100)) {
    errors.push('Pool size must be between 1 and 100');
  }
  
  // Timeout validation
  if (config.timeout && (config.timeout < 1000 || config.timeout > 300000)) {
    warnings.push('Timeout should be between 1000ms and 300000ms (5 minutes)');
  }
  
  // Retry validation
  if (config.retryAttempts && (config.retryAttempts < 0 || config.retryAttempts > 10)) {
    warnings.push('Retry attempts should be between 0 and 10');
  }
  
  if (config.retryDelay && (config.retryDelay < 100 || config.retryDelay > 30000)) {
    warnings.push('Retry delay should be between 100ms and 30000ms');
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

// Logging configuration validation
export function validateLoggingConfig(config: LoggingConfig): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  if (!['debug', 'info', 'warn', 'error'].includes(config.level)) {
    errors.push('Log level must be one of: debug, info, warn, error');
  }
  
  if (!config.console && !config.file) {
    warnings.push('Neither console nor file logging is enabled');
  }
  
  if (config.maxFileSize) {
    const sizeRegex = /^(\d+)(k|m|g)$/i;
    if (!sizeRegex.test(config.maxFileSize)) {
      errors.push('Max file size must be in format like "10m", "100k", "1g"');
    }
  }
  
  if (config.maxFiles && (config.maxFiles < 1 || config.maxFiles > 100)) {
    warnings.push('Max files should be between 1 and 100');
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

// Security configuration validation
export function validateSecurityConfig(config: SecurityConfig): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  if (config.rateLimitWindowMs && (config.rateLimitWindowMs < 1000 || config.rateLimitWindowMs > 3600000)) {
    warnings.push('Rate limit window should be between 1 second and 1 hour');
  }
  
  if (config.rateLimitMaxRequests && (config.rateLimitMaxRequests < 1 || config.rateLimitMaxRequests > 10000)) {
    warnings.push('Rate limit max requests should be between 1 and 10000');
  }
  
  if (config.bcryptRounds && (config.bcryptRounds < 4 || config.bcryptRounds > 15)) {
    errors.push('Bcrypt rounds must be between 4 and 15');
  }
  
  if (config.sessionTimeout && (config.sessionTimeout < 60000 || config.sessionTimeout > 86400000)) {
    warnings.push('Session timeout should be between 1 minute and 24 hours');
  }
  
  if (config.maxLoginAttempts && (config.maxLoginAttempts < 1 || config.maxLoginAttempts > 100)) {
    warnings.push('Max login attempts should be between 1 and 100');
  }
  
  if (config.lockoutDuration && (config.lockoutDuration < 60000 || config.lockoutDuration > 86400000)) {
    warnings.push('Lockout duration should be between 1 minute and 24 hours');
  }
  
  if (config.cors.length === 0) {
    warnings.push('No CORS origins specified');
  }
  
  // Validate CORS origins format
  for (const origin of config.cors) {
    try {
      new URL(origin);
    } catch {
      if (origin !== '*') {
        errors.push(`Invalid CORS origin format: ${origin}`);
      }
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

// Complete configuration validation
export function validateCompleteConfig(config: EnvironmentConfig): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Validate each section
  const dbValidation = validateDatabaseConfig(config.database);
  const logValidation = validateLoggingConfig(config.logging);
  const secValidation = validateSecurityConfig(config.security);
  
  errors.push(...dbValidation.errors);
  errors.push(...logValidation.errors);
  errors.push(...secValidation.errors);
  
  warnings.push(...dbValidation.warnings);
  warnings.push(...logValidation.warnings);
  warnings.push(...secValidation.warnings);
  
  // Cross-section validations
  if (config.isProduction && config.logging.level === 'debug') {
    warnings.push('Debug logging is enabled in production');
  }
  
  if (config.isProduction && !config.security.rateLimit) {
    warnings.push('Rate limiting is disabled in production');
  }
  
  if (config.isDevelopment && config.security.bcryptRounds && config.security.bcryptRounds > 10) {
    warnings.push('High bcrypt rounds may slow down development');
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

// Configuration sanitization (remove sensitive data for logging)
export function sanitizeConfig(config: EnvironmentConfig): any {
  const sanitized = JSON.parse(JSON.stringify(config));
  
  // Remove sensitive database information
  if (sanitized.database.password) {
    sanitized.database.password = '***';
  }
  if (sanitized.database.username) {
    sanitized.database.username = '***';
  }
  
  return sanitized;
}

// Get configuration with validation
export function getValidatedConfig(): EnvironmentConfig {
  // First validate environment variables
  const envValidation = validateEnvironmentVariables();
  if (!envValidation.isValid) {
    throw new Error(`Environment validation failed: ${envValidation.errors.join(', ')}`);
  }
  
  // Log warnings
  if (envValidation.warnings.length > 0) {
    console.warn('Environment warnings:', envValidation.warnings);
  }
  
  // Get configuration
  const { getConfig } = require('./database');
  const config = getConfig();
  
  // Validate complete configuration
  const configValidation = validateCompleteConfig(config);
  if (!configValidation.isValid) {
    throw new Error(`Configuration validation failed: ${configValidation.errors.join(', ')}`);
  }
  
  // Log warnings
  if (configValidation.warnings.length > 0) {
    console.warn('Configuration warnings:', configValidation.warnings);
  }
  
  return config;
}