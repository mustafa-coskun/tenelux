// Configuration module exports

export * from './database';
export * from './validation';
export { getEnvironmentService } from './environment';

// Re-export commonly used types and functions
export type { 
  DatabaseConfig, 
  EnvironmentConfig as DatabaseEnvironmentConfig, 
  LoggingConfig, 
  SecurityConfig 
} from './database';

export type { ValidationResult } from './validation';

export { 
  getConfig, 
  validateConfig, 
  developmentConfig, 
  productionConfig, 
  testConfig 
} from './database';

export { 
  validateEnvironmentVariables, 
  validateCompleteConfig, 
  getValidatedConfig, 
  sanitizeConfig 
} from './validation';