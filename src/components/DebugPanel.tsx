import React, { useState, useEffect } from 'react';
import { getSessionDebugger, DebugInfo, LogEntry } from '../services/SessionDebugger';
import { getAdminAuthService, AdminPermission } from '../services/AdminAuthService';
import PerformanceDashboard from './PerformanceDashboard';
import AdminLogin from './AdminLogin';
import './DebugPanel.css';

interface DebugPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const DebugPanel: React.FC<DebugPanelProps> = ({ isOpen, onClose }) => {
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'session' | 'storage' | 'errors' | 'logs' | 'tools' | 'performance'>('overview');
  const [showPerformanceDashboard, setShowPerformanceDashboard] = useState(false);
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loggingEnabled, setLoggingEnabled] = useState(false);
  const [sessionTimeRemaining, setSessionTimeRemaining] = useState(0);
  
  const sessionDebugger = getSessionDebugger();
  const adminAuthService = getAdminAuthService();

  useEffect(() => {
    if (isOpen) {
      // Check admin authentication first
      if (!adminAuthService.isAuthenticated()) {
        setShowAdminLogin(true);
        return;
      }
      
      // Check if user has permission to view debug panel
      if (!adminAuthService.hasPermission('view_debug_panel')) {
        onClose();
        alert('Bu paneli görüntüleme yetkiniz bulunmamaktadır.');
        return;
      }
      
      loadDebugInfo();
      loadLogs();
      updateSessionTimer();
    }
  }, [isOpen]);

  // Update session timer every minute
  useEffect(() => {
    if (isOpen && adminAuthService.isAuthenticated()) {
      const interval = setInterval(updateSessionTimer, 60000);
      return () => clearInterval(interval);
    }
  }, [isOpen]);

  useEffect(() => {
    // Subscribe to new log entries
    const unsubscribe = sessionDebugger.subscribeToLogs((entry: LogEntry) => {
      setLogs(prev => [entry, ...prev.slice(0, 99)]); // Keep last 100 logs
    });

    return unsubscribe;
  }, [sessionDebugger]);

  const loadDebugInfo = async () => {
    setIsLoading(true);
    try {
      const info = await sessionDebugger.getDebugInfo();
      setDebugInfo(info);
    } catch (error) {
      console.error('Failed to load debug info:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadLogs = () => {
    const allLogs = sessionDebugger.getLogs();
    setLogs(allLogs.slice(0, 100)); // Show last 100 logs
  };

  const updateSessionTimer = () => {
    setSessionTimeRemaining(adminAuthService.getSessionTimeRemaining());
  };

  const handleAdminLoginSuccess = () => {
    setShowAdminLogin(false);
    loadDebugInfo();
    loadLogs();
    updateSessionTimer();
  };

  const handleAdminLogout = () => {
    adminAuthService.logout();
    onClose();
  };

  const handleExtendSession = () => {
    if (adminAuthService.extendSession()) {
      updateSessionTimer();
      alert('Oturum 4 saat daha uzatıldı.');
    }
  };

  const checkPermission = (permission: AdminPermission): boolean => {
    return adminAuthService.hasPermission(permission);
  };

  const handleExportData = async () => {
    if (!checkPermission('export_data')) {
      alert('Veri dışa aktarma yetkiniz bulunmamaktadır.');
      return;
    }
    
    try {
      await sessionDebugger.downloadDebugData();
    } catch (error) {
      console.error('Failed to export data:', error);
    }
  };

  const handleClearData = () => {
    if (!checkPermission('clear_system_data')) {
      alert('Sistem verilerini temizleme yetkiniz bulunmamaktadır.');
      return;
    }
    
    if (window.confirm('Bu işlem tüm oturum verilerini silecek. Devam etmek istiyor musunuz?')) {
      sessionDebugger.clearAllSessionData();
      loadDebugInfo();
    }
  };

  const handleSimulateError = (errorType: string) => {
    if (!checkPermission('simulate_errors')) {
      alert('Hata simülasyonu yetkiniz bulunmamaktadır.');
      return;
    }
    
    sessionDebugger.simulateError(errorType as any);
    loadDebugInfo();
  };

  const toggleLogging = () => {
    const newState = !loggingEnabled;
    setLoggingEnabled(newState);
    sessionDebugger.enableLogging(newState);
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (date: Date): string => {
    return new Intl.DateTimeFormat('tr-TR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(date);
  };

  if (!isOpen) return null;

  // Show admin login if not authenticated
  if (showAdminLogin) {
    return (
      <AdminLogin
        onLoginSuccess={handleAdminLoginSuccess}
        onCancel={onClose}
      />
    );
  }

  // Check authentication again
  if (!adminAuthService.isAuthenticated()) {
    onClose();
    return null;
  }

  const currentUser = adminAuthService.getCurrentUser();

  return (
    <div className="debug-panel-overlay">
      <div className="debug-panel">
        <div className="debug-panel-header">
          <div className="header-left">
            <h2>🔧 Admin Debug Panel</h2>
            <div className="admin-info">
              <span className="admin-user">👤 {currentUser?.username}</span>
              <span className="admin-role">({currentUser?.role})</span>
              <span className="session-timer">
                ⏱️ {sessionTimeRemaining}dk
                {adminAuthService.isSessionExpiringSoon() && (
                  <button onClick={handleExtendSession} className="extend-session">
                    Uzat
                  </button>
                )}
              </span>
            </div>
          </div>
          <div className="header-right">
            <button onClick={handleAdminLogout} className="logout-button">
              🚪 Çıkış
            </button>
            <button className="debug-panel-close" onClick={onClose}>×</button>
          </div>
        </div>

        <div className="debug-panel-tabs">
          <button 
            className={activeTab === 'overview' ? 'active' : ''}
            onClick={() => setActiveTab('overview')}
          >
            Genel Bakış
          </button>
          <button 
            className={activeTab === 'session' ? 'active' : ''}
            onClick={() => setActiveTab('session')}
          >
            Oturum
          </button>
          <button 
            className={activeTab === 'storage' ? 'active' : ''}
            onClick={() => setActiveTab('storage')}
          >
            Depolama
          </button>
          <button 
            className={activeTab === 'errors' ? 'active' : ''}
            onClick={() => setActiveTab('errors')}
          >
            Hatalar
          </button>
          <button 
            className={activeTab === 'logs' ? 'active' : ''}
            onClick={() => setActiveTab('logs')}
          >
            Loglar
          </button>
          <button 
            className={activeTab === 'tools' ? 'active' : ''}
            onClick={() => setActiveTab('tools')}
          >
            Araçlar
          </button>
          {checkPermission('view_performance_dashboard') && (
            <button 
              className={activeTab === 'performance' ? 'active' : ''}
              onClick={() => setActiveTab('performance')}
            >
              Performans
            </button>
          )}
        </div>

        <div className="debug-panel-content">
          {isLoading ? (
            <div className="debug-loading">Yükleniyor...</div>
          ) : (
            <>
              {activeTab === 'overview' && debugInfo && (
                <div className="debug-section">
                  <h3>Sistem Bilgileri</h3>
                  <div className="debug-grid">
                    <div className="debug-item">
                      <label>Platform:</label>
                      <span>{debugInfo.systemInfo.platform}</span>
                    </div>
                    <div className="debug-item">
                      <label>Dil:</label>
                      <span>{debugInfo.systemInfo.language}</span>
                    </div>
                    <div className="debug-item">
                      <label>Çevrimiçi:</label>
                      <span className={debugInfo.systemInfo.onLine ? 'status-online' : 'status-offline'}>
                        {debugInfo.systemInfo.onLine ? 'Evet' : 'Hayır'}
                      </span>
                    </div>
                    <div className="debug-item">
                      <label>Çerezler:</label>
                      <span>{debugInfo.systemInfo.cookieEnabled ? 'Etkin' : 'Devre Dışı'}</span>
                    </div>
                  </div>

                  <h3>Bağlantı Durumu</h3>
                  <div className="debug-grid">
                    <div className="debug-item">
                      <label>Sunucu Bağlantısı:</label>
                      <span className={debugInfo.connectionState.isConnected ? 'status-online' : 'status-offline'}>
                        {debugInfo.connectionState.isConnected ? 'Bağlı' : 'Bağlı Değil'}
                      </span>
                    </div>
                    <div className="debug-item">
                      <label>Bekleyen Güncellemeler:</label>
                      <span>{debugInfo.connectionState.pendingUpdates}</span>
                    </div>
                  </div>

                  {debugInfo.systemInfo.storageQuota && (
                    <>
                      <h3>Depolama Kotası</h3>
                      <div className="debug-grid">
                        <div className="debug-item">
                          <label>Kullanılan:</label>
                          <span>{formatBytes(debugInfo.systemInfo.storageQuota.usage || 0)}</span>
                        </div>
                        <div className="debug-item">
                          <label>Kota:</label>
                          <span>{formatBytes(debugInfo.systemInfo.storageQuota.quota || 0)}</span>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {activeTab === 'session' && debugInfo && (
                <div className="debug-section">
                  <h3>Kullanıcı Bilgileri</h3>
                  {debugInfo.user ? (
                    <div className="debug-grid">
                      <div className="debug-item">
                        <label>ID:</label>
                        <span className="debug-code">{debugInfo.user.id}</span>
                      </div>
                      <div className="debug-item">
                        <label>İsim:</label>
                        <span>{debugInfo.user.displayName} (@{debugInfo.user.username})</span>
                      </div>
                      <div className="debug-item">
                        <label>Oluşturulma:</label>
                        <span>{formatDate(debugInfo.user.createdAt)}</span>
                      </div>
                      <div className="debug-item">
                        <label>Son Aktivite:</label>
                        <span>{formatDate(debugInfo.user.lastActive)}</span>
                      </div>
                    </div>
                  ) : (
                    <p>Kullanıcı oturumu bulunamadı</p>
                  )}

                  <h3>Oyun Oturumu</h3>
                  {debugInfo.session ? (
                    <div className="debug-grid">
                      <div className="debug-item">
                        <label>Durum:</label>
                        <span className="debug-status">{debugInfo.session.currentState}</span>
                      </div>
                      <div className="debug-item">
                        <label>Lobi ID:</label>
                        <span className="debug-code">{debugInfo.session.lobbyId || 'Yok'}</span>
                      </div>
                      <div className="debug-item">
                        <label>Turnuva ID:</label>
                        <span className="debug-code">{debugInfo.session.tournamentId || 'Yok'}</span>
                      </div>
                      <div className="debug-item">
                        <label>Son Güncelleme:</label>
                        <span>{formatDate(debugInfo.session.lastUpdated)}</span>
                      </div>
                    </div>
                  ) : (
                    <p>Aktif oyun oturumu bulunamadı</p>
                  )}

                  <h3>Doğrulama Sonuçları</h3>
                  {debugInfo.validationResults && (
                    <div className="debug-validation">
                      <div className="debug-item">
                        <label>Geçerli:</label>
                        <span className={debugInfo.validationResults.isValid ? 'status-valid' : 'status-invalid'}>
                          {debugInfo.validationResults.isValid ? 'Evet' : 'Hayır'}
                        </span>
                      </div>
                      {debugInfo.validationResults.errors && debugInfo.validationResults.errors.length > 0 && (
                        <div className="debug-errors">
                          <label>Hatalar:</label>
                          <ul>
                            {debugInfo.validationResults.errors.map((error: string, index: number) => (
                              <li key={index} className="debug-error">{error}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'storage' && debugInfo && (
                <div className="debug-section">
                  <h3>localStorage</h3>
                  <div className="debug-storage">
                    {Object.keys(debugInfo.localStorage).length > 0 ? (
                      Object.entries(debugInfo.localStorage).map(([key, value]) => (
                        <div key={key} className="debug-storage-item">
                          <div className="debug-storage-key">{key}</div>
                          <div className="debug-storage-value">
                            <pre>{JSON.stringify(value, null, 2)}</pre>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p>localStorage boş</p>
                    )}
                  </div>

                  <h3>sessionStorage</h3>
                  <div className="debug-storage">
                    {Object.keys(debugInfo.sessionStorage).length > 0 ? (
                      Object.entries(debugInfo.sessionStorage).map(([key, value]) => (
                        <div key={key} className="debug-storage-item">
                          <div className="debug-storage-key">{key}</div>
                          <div className="debug-storage-value">
                            <pre>{JSON.stringify(value, null, 2)}</pre>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p>sessionStorage boş</p>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'errors' && debugInfo && (
                <div className="debug-section">
                  <h3>Hata Geçmişi</h3>
                  <div className="debug-errors-list">
                    {debugInfo.errorHistory.length > 0 ? (
                      debugInfo.errorHistory.map((error: any, index: number) => (
                        <div key={index} className={`debug-error-item debug-error-${error.severity?.toLowerCase()}`}>
                          <div className="debug-error-header">
                            <span className="debug-error-type">{error.type}</span>
                            <span className="debug-error-time">{formatDate(new Date(error.timestamp))}</span>
                          </div>
                          <div className="debug-error-message">{error.message}</div>
                          {error.context && (
                            <div className="debug-error-context">
                              <strong>Bağlam:</strong> {JSON.stringify(error.context)}
                            </div>
                          )}
                        </div>
                      ))
                    ) : (
                      <p>Hata kaydı bulunamadı</p>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'logs' && (
                <div className="debug-section">
                  <div className="debug-logs-header">
                    <h3>Sistem Logları</h3>
                    <div className="debug-logs-controls">
                      <button 
                        className={`debug-toggle ${loggingEnabled ? 'active' : ''}`}
                        onClick={toggleLogging}
                      >
                        {loggingEnabled ? 'Loglama Aktif' : 'Loglama Pasif'}
                      </button>
                      <button onClick={() => sessionDebugger.clearLogs()}>
                        Logları Temizle
                      </button>
                    </div>
                  </div>
                  <div className="debug-logs-list">
                    {logs.length > 0 ? (
                      logs.map((log, index) => (
                        <div key={index} className={`debug-log-item debug-log-${log.level}`}>
                          <div className="debug-log-header">
                            <span className="debug-log-level">{log.level.toUpperCase()}</span>
                            <span className="debug-log-category">{log.category}</span>
                            <span className="debug-log-time">{formatDate(log.timestamp)}</span>
                          </div>
                          <div className="debug-log-message">{log.message}</div>
                          {log.data && (
                            <div className="debug-log-data">
                              <pre>{JSON.stringify(log.data, null, 2)}</pre>
                            </div>
                          )}
                        </div>
                      ))
                    ) : (
                      <p>Log kaydı bulunamadı</p>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'tools' && (
                <div className="debug-section">
                  <h3>Veri İşlemleri</h3>
                  <div className="debug-tools">
                    <button onClick={handleExportData} className="debug-tool-button">
                      📥 Debug Verilerini İndir
                    </button>
                    <button onClick={handleClearData} className="debug-tool-button danger">
                      🗑️ Tüm Verileri Temizle
                    </button>
                    <button onClick={loadDebugInfo} className="debug-tool-button">
                      🔄 Verileri Yenile
                    </button>
                  </div>

                  <h3>Hata Simülasyonu</h3>
                  <div className="debug-tools">
                    <button onClick={() => handleSimulateError('network')} className="debug-tool-button">
                      📡 Ağ Hatası
                    </button>
                    <button onClick={() => handleSimulateError('storage')} className="debug-tool-button">
                      💾 Depolama Hatası
                    </button>
                    <button onClick={() => handleSimulateError('corruption')} className="debug-tool-button">
                      🔧 Veri Bozulması
                    </button>
                    <button onClick={() => handleSimulateError('timeout')} className="debug-tool-button">
                      ⏱️ Zaman Aşımı
                    </button>
                  </div>

                  <h3>Konsol Komutları</h3>
                  <div className="debug-console-help">
                    <p>Tarayıcı konsolunda aşağıdaki komutları kullanabilirsiniz:</p>
                    <ul>
                      <li><code>TenebrisDebug.getStats()</code> - Oturum istatistikleri</li>
                      <li><code>TenebrisDebug.exportData()</code> - Veri dışa aktarma</li>
                      <li><code>TenebrisDebug.clearData()</code> - Tüm verileri temizle</li>
                      <li><code>TenebrisDebug.enableLogging(true)</code> - Loglama etkinleştir</li>
                      <li><code>TenebrisDebug.getLogs()</code> - Tüm logları görüntüle</li>
                    </ul>
                  </div>
                </div>
              )}

              {activeTab === 'performance' && checkPermission('view_performance_dashboard') && (
                <div className="debug-section">
                  <h3>Performans İzleme</h3>
                  <div className="debug-tools">
                    <button 
                      onClick={() => setShowPerformanceDashboard(true)} 
                      className="debug-tool-button"
                    >
                      📊 Performans Panelini Aç
                    </button>
                  </div>
                  
                  <div className="performance-info">
                    <p>Performans paneli şunları içerir:</p>
                    <ul>
                      <li>Gerçek zamanlı oturum kurtarma metrikleri</li>
                      <li>Senkronizasyon performans istatistikleri</li>
                      <li>Depolama kullanımı ve optimizasyon</li>
                      <li>Kullanıcı davranış kalıpları</li>
                      <li>Hata analizi ve raporlama</li>
                    </ul>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <PerformanceDashboard 
        isVisible={showPerformanceDashboard}
        onClose={() => setShowPerformanceDashboard(false)}
      />
    </div>
  );
};

export default DebugPanel;