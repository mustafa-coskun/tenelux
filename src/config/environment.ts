// Environment configuration for different deployment scenarios
import { getConfig as getDatabaseConfig, validateConfig } from './database';

export interface EnvironmentConfig {
  websocketUrl: string;
  apiUrl: string;
  isDevelopment: boolean;
  isProduction: boolean;
  isTunnel: boolean;
}

class EnvironmentService {
  private static instance: EnvironmentService | null = null;
  private config: EnvironmentConfig;

  constructor() {
    this.config = this.detectEnvironment();
  }

  static getInstance(): EnvironmentService {
    if (!EnvironmentService.instance) {
      EnvironmentService.instance = new EnvironmentService();
    }
    return EnvironmentService.instance;
  }

  private detectEnvironment(): EnvironmentConfig {
    const hostname = window.location.hostname;
    const protocol = window.location.protocol;
    const port = window.location.port;

    console.log('🌍 Environment Detection:', { hostname, protocol, port });

    // Check for environment variables first
    const envApiUrl = process.env.REACT_APP_API_URL;
    const envWsUrl = process.env.REACT_APP_WS_URL;

    if (envApiUrl && envWsUrl) {
      const config = {
        websocketUrl: envWsUrl,
        apiUrl: envApiUrl,
        isDevelopment: envApiUrl.includes('localhost'),
        isProduction: !envApiUrl.includes('localhost'),
        isTunnel: envApiUrl.includes('coshbilisim.com')
      };
      console.log('🔧 Environment variables config:', config);
      return config;
    }

    // Fallback: Use current domain dynamically (no hard coding)
    const wsProtocol = protocol === 'https:' ? 'wss:' : 'ws:';
    const baseUrl = `${protocol}//${hostname}${port ? `:${port}` : ''}`;
    const wsUrl = `${wsProtocol}//${hostname}${port ? `:${port}` : ''}`;

    const config = {
      websocketUrl: wsUrl,
      apiUrl: baseUrl,
      isDevelopment: hostname === 'localhost' || hostname === '127.0.0.1',
      isProduction: !hostname.includes('localhost') && !hostname.includes('127.0.0.1'),
      isTunnel: hostname.includes('coshbilisim.com')
    };
    
    console.log('🌍 Dynamic environment config:', config);
    return config;
  }

  getConfig(): EnvironmentConfig {
    return this.config;
  }

  getWebSocketUrl(): string {
    return this.config.websocketUrl;
  }

  getApiUrl(): string {
    return this.config.apiUrl;
  }

  isDev(): boolean {
    return this.config.isDevelopment;
  }

  isProd(): boolean {
    return this.config.isProduction;
  }

  isTunnelEnvironment(): boolean {
    return this.config.isTunnel;
  }

  // Debug info for troubleshooting
  getDebugInfo(): Record<string, any> {
    return {
      hostname: window.location.hostname,
      protocol: window.location.protocol,
      port: window.location.port,
      href: window.location.href,
      config: this.config,
      userAgent: navigator.userAgent
    };
  }

  // Get database configuration
  getDatabaseConfig() {
    return getDatabaseConfig();
  }

  // Validate database configuration
  validateDatabaseConfig() {
    const dbConfig = getDatabaseConfig();
    const errors = validateConfig(dbConfig);

    if (errors.length > 0) {
      throw new Error(`Database configuration errors: ${errors.join(', ')}`);
    }

    return dbConfig;
  }
}

export const getEnvironmentService = () => EnvironmentService.getInstance();
export default EnvironmentService;