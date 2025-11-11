import React, { useState, useEffect } from 'react';
import { getEnvironmentService } from '../config/environment';
import { useTranslation } from '../hooks/useTranslation';
import './ConnectionDebug.css';

interface ConnectionDebugProps {
  isVisible?: boolean;
}

export const ConnectionDebug: React.FC<ConnectionDebugProps> = ({ isVisible = false }) => {
  const { t } = useTranslation();
  const [debugInfo, setDebugInfo] = useState<any>(null);
  const [wsStatus, setWsStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('disconnected');
  const [testSocket, setTestSocket] = useState<WebSocket | null>(null);

  useEffect(() => {
    const envService = getEnvironmentService();
    setDebugInfo(envService.getDebugInfo());
  }, []);

  const testWebSocketConnection = () => {
    if (testSocket) {
      testSocket.close();
    }

    const envService = getEnvironmentService();
    const wsUrl = envService.getWebSocketUrl();
    
    setWsStatus('connecting');
    
    const ws = new WebSocket(wsUrl);
    setTestSocket(ws);

    ws.onopen = () => {
      console.log('✅ WebSocket test connection successful');
      setWsStatus('connected');
    };

    ws.onclose = () => {
      console.log('🔌 WebSocket test connection closed');
      setWsStatus('disconnected');
    };

    ws.onerror = (error) => {
      console.error('❌ WebSocket test connection error:', error);
      setWsStatus('error');
    };

    // Auto close after 5 seconds
    setTimeout(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    }, 5000);
  };

  if (!isVisible || !debugInfo) {
    return null;
  }

  return (
    <div className="connection-debug">
      <div className="debug-header">
        <h3>🔧 {t('debug.title')}</h3>
      </div>
      
      <div className="debug-content">
        <div className="debug-section">
          <h4>{t('debug.environment')}</h4>
          <div className="debug-item">
            <span className="label">{t('debug.hostname')}</span>
            <span className="value">{debugInfo.hostname}</span>
          </div>
          <div className="debug-item">
            <span className="label">{t('debug.protocol')}</span>
            <span className="value">{debugInfo.protocol}</span>
          </div>
          <div className="debug-item">
            <span className="label">{t('debug.port')}</span>
            <span className="value">{debugInfo.port || t('debug.default')}</span>
          </div>
          <div className="debug-item">
            <span className="label">{t('debug.fullUrl')}</span>
            <span className="value">{debugInfo.href}</span>
          </div>
        </div>

        <div className="debug-section">
          <h4>{t('debug.websocketConfig')}</h4>
          <div className="debug-item">
            <span className="label">{t('debug.websocketUrl')}</span>
            <span className="value">{debugInfo.config.websocketUrl}</span>
          </div>
          <div className="debug-item">
            <span className="label">{t('debug.apiUrl')}</span>
            <span className="value">{debugInfo.config.apiUrl}</span>
          </div>
          <div className="debug-item">
            <span className="label">{t('debug.environmentType')}</span>
            <span className="value">
              {debugInfo.config.isDevelopment ? t('debug.development') : t('debug.production')}
              {debugInfo.config.isTunnel && ` (${t('debug.cloudflare')})`}
            </span>
          </div>
        </div>

        <div className="debug-section">
          <h4>{t('debug.connectionTest')}</h4>
          <div className="debug-item">
            <span className="label">{t('debug.status')}</span>
            <span className={`value status-${wsStatus}`}>
              {wsStatus === 'connecting' && `🔄 ${t('debug.connecting')}`}
              {wsStatus === 'connected' && `✅ ${t('debug.connected')}`}
              {wsStatus === 'disconnected' && `🔌 ${t('debug.disconnected')}`}
              {wsStatus === 'error' && `❌ ${t('debug.error')}`}
            </span>
          </div>
          <button 
            className="test-btn"
            onClick={testWebSocketConnection}
            disabled={wsStatus === 'connecting'}
          >
            {t('debug.testButton')}
          </button>
        </div>

        <div className="debug-section">
          <h4>{t('debug.browserInfo')}</h4>
          <div className="debug-item">
            <span className="label">{t('debug.userAgent')}</span>
            <span className="value small">{debugInfo.userAgent}</span>
          </div>
        </div>
      </div>
    </div>
  );
};