import React, { useState, useEffect } from 'react';
import { getPerformanceMonitor, PerformanceReport } from '../services/PerformanceMonitor';
import { getStorageOptimizer, StorageMetrics } from '../services/StorageOptimizer';
import { getAdminAuthService } from '../services/AdminAuthService';
import './PerformanceDashboard.css';

interface PerformanceDashboardProps {
  isVisible: boolean;
  onClose: () => void;
}

const PerformanceDashboard: React.FC<PerformanceDashboardProps> = ({ isVisible, onClose }) => {
  const [report, setReport] = useState<PerformanceReport | null>(null);
  const [storageMetrics, setStorageMetrics] = useState<StorageMetrics | null>(null);
  const [realTimeMetrics, setRealTimeMetrics] = useState<any>(null);
  const [refreshInterval, setRefreshInterval] = useState<NodeJS.Timeout | null>(null);

  const performanceMonitor = getPerformanceMonitor();
  const storageOptimizer = getStorageOptimizer();
  const adminAuthService = getAdminAuthService();

  useEffect(() => {
    if (isVisible) {
      // Initial load
      refreshData();
      
      // Set up auto-refresh every 5 seconds
      const interval = setInterval(refreshData, 5000);
      setRefreshInterval(interval);
      
      return () => {
        if (interval) clearInterval(interval);
      };
    } else {
      if (refreshInterval) {
        clearInterval(refreshInterval);
        setRefreshInterval(null);
      }
    }
  }, [isVisible]);

  const refreshData = () => {
    try {
      const newReport = performanceMonitor.generateReport();
      const newStorageMetrics = storageOptimizer.getStorageMetrics();
      const newRealTimeMetrics = performanceMonitor.getRealTimeMetrics();
      
      setReport(newReport);
      setStorageMetrics(newStorageMetrics);
      setRealTimeMetrics(newRealTimeMetrics);
    } catch (error) {
      console.error('Failed to refresh performance data:', error);
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDuration = (ms: number): string => {
    if (ms < 1000) return `${ms.toFixed(1)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const formatPercentage = (value: number): string => {
    return `${(value * 100).toFixed(1)}%`;
  };

  const getStatusColor = (value: number, thresholds: { good: number; warning: number }): string => {
    if (value >= thresholds.good) return 'status-good';
    if (value >= thresholds.warning) return 'status-warning';
    return 'status-error';
  };

  const handleCleanupStorage = () => {
    if (!adminAuthService.hasPermission('manage_storage')) {
      alert('Depolama yönetimi yetkiniz bulunmamaktadır.');
      return;
    }
    
    const result = storageOptimizer.cleanupOldSessions();
    alert(`Temizlik tamamlandı: ${result.cleaned} öğe kaldırıldı, ${formatBytes(result.freedBytes)} alan boşaltıldı`);
    refreshData();
  };

  const handleClearMetrics = () => {
    if (!adminAuthService.hasPermission('clear_system_data')) {
      alert('Sistem verilerini temizleme yetkiniz bulunmamaktadır.');
      return;
    }
    
    if (window.confirm('Tüm performans metriklerini silmek istediğinizden emin misiniz?')) {
      performanceMonitor.clearMetrics();
      refreshData();
    }
  };

  const handleExportMetrics = () => {
    if (!adminAuthService.hasPermission('export_data')) {
      alert('Veri dışa aktarma yetkiniz bulunmamaktadır.');
      return;
    }
    
    const exported = performanceMonitor.exportMetrics();
    const dataStr = JSON.stringify(exported, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `performance-metrics-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (!isVisible) return null;

  // Check admin authentication and permissions
  if (!adminAuthService.isAuthenticated() || !adminAuthService.hasPermission('view_performance_dashboard')) {
    return (
      <div className="performance-dashboard-overlay">
        <div className="performance-dashboard">
          <div className="dashboard-header">
            <h2>Erişim Reddedildi</h2>
            <button onClick={onClose} className="btn-close">✕</button>
          </div>
          <div className="dashboard-content">
            <div className="access-denied">
              <h3>🚫 Yetkisiz Erişim</h3>
              <p>Bu paneli görüntüleme yetkiniz bulunmamaktadır.</p>
              <p>Lütfen sistem yöneticisi ile iletişime geçin.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="performance-dashboard-overlay">
      <div className="performance-dashboard">
        <div className="dashboard-header">
          <h2>Performance Dashboard</h2>
          <div className="dashboard-controls">
            <button onClick={refreshData} className="btn-refresh">
              🔄 Refresh
            </button>
            <button onClick={handleExportMetrics} className="btn-export">
              📊 Export
            </button>
            <button onClick={onClose} className="btn-close">
              ✕
            </button>
          </div>
        </div>

        <div className="dashboard-content">
          {/* Real-time Metrics */}
          <div className="metrics-section">
            <h3>Real-time Status</h3>
            {realTimeMetrics && (
              <div className="metrics-grid">
                <div className="metric-card">
                  <div className="metric-label">Active Recoveries</div>
                  <div className="metric-value">{realTimeMetrics.activeRecoveries}</div>
                </div>
                <div className="metric-card">
                  <div className="metric-label">Active Syncs</div>
                  <div className="metric-value">{realTimeMetrics.activeSyncs}</div>
                </div>
                <div className="metric-card">
                  <div className="metric-label">Avg Recovery Time</div>
                  <div className="metric-value">{formatDuration(realTimeMetrics.averageRecoveryTime)}</div>
                </div>
                <div className="metric-card">
                  <div className="metric-label">Recent Success Rate</div>
                  <div className={`metric-value ${getStatusColor(realTimeMetrics.recentSuccessRate, { good: 0.9, warning: 0.7 })}`}>
                    {formatPercentage(realTimeMetrics.recentSuccessRate)}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Session Recovery Metrics */}
          {report && (
            <div className="metrics-section">
              <h3>Session Recovery (Last 24h)</h3>
              <div className="metrics-grid">
                <div className="metric-card">
                  <div className="metric-label">Total Attempts</div>
                  <div className="metric-value">{report.sessionRecovery.totalAttempts}</div>
                </div>
                <div className="metric-card">
                  <div className="metric-label">Success Rate</div>
                  <div className={`metric-value ${getStatusColor(report.sessionRecovery.successRate, { good: 0.95, warning: 0.8 })}`}>
                    {formatPercentage(report.sessionRecovery.successRate)}
                  </div>
                </div>
                <div className="metric-card">
                  <div className="metric-label">Average Duration</div>
                  <div className="metric-value">{formatDuration(report.sessionRecovery.averageDuration)}</div>
                </div>
                <div className="metric-card">
                  <div className="metric-label">Error Types</div>
                  <div className="metric-value">{Object.keys(report.sessionRecovery.errorBreakdown).length}</div>
                </div>
              </div>

              {Object.keys(report.sessionRecovery.errorBreakdown).length > 0 && (
                <div className="error-breakdown">
                  <h4>Error Breakdown</h4>
                  <div className="error-list">
                    {Object.entries(report.sessionRecovery.errorBreakdown).map(([error, count]) => (
                      <div key={error} className="error-item">
                        <span className="error-type">{error}</span>
                        <span className="error-count">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Synchronization Metrics */}
          {report && (
            <div className="metrics-section">
              <h3>Synchronization (Last 24h)</h3>
              <div className="metrics-grid">
                <div className="metric-card">
                  <div className="metric-label">Total Operations</div>
                  <div className="metric-value">{report.synchronization.totalOperations}</div>
                </div>
                <div className="metric-card">
                  <div className="metric-label">Success Rate</div>
                  <div className={`metric-value ${getStatusColor(report.synchronization.successRate, { good: 0.98, warning: 0.9 })}`}>
                    {formatPercentage(report.synchronization.successRate)}
                  </div>
                </div>
                <div className="metric-card">
                  <div className="metric-label">Average Duration</div>
                  <div className="metric-value">{formatDuration(report.synchronization.averageDuration)}</div>
                </div>
              </div>

              {Object.keys(report.synchronization.operationBreakdown).length > 0 && (
                <div className="operation-breakdown">
                  <h4>Operation Breakdown</h4>
                  <div className="operation-list">
                    {Object.entries(report.synchronization.operationBreakdown).map(([operation, count]) => (
                      <div key={operation} className="operation-item">
                        <span className="operation-type">{operation}</span>
                        <span className="operation-count">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Storage Metrics */}
          {storageMetrics && (
            <div className="metrics-section">
              <h3>Storage Usage</h3>
              <div className="metrics-grid">
                <div className="metric-card">
                  <div className="metric-label">Total Size</div>
                  <div className="metric-value">{formatBytes(storageMetrics.totalSize)}</div>
                </div>
                <div className="metric-card">
                  <div className="metric-label">Item Count</div>
                  <div className="metric-value">{storageMetrics.itemCount}</div>
                </div>
                <div className="metric-card">
                  <div className="metric-label">Average Size</div>
                  <div className="metric-value">{formatBytes(storageMetrics.averageSize)}</div>
                </div>
                <div className="metric-card">
                  <div className="metric-label">Compression Efficiency</div>
                  <div className="metric-value">
                    {report ? formatPercentage(1 - report.storage.compressionEfficiency) : 'N/A'}
                  </div>
                </div>
              </div>

              <div className="storage-actions">
                <button onClick={handleCleanupStorage} className="btn-cleanup">
                  🧹 Cleanup Old Sessions
                </button>
                <span className="storage-info">
                  {storageMetrics.oldestItem && (
                    <>Oldest: {storageMetrics.oldestItem.toLocaleDateString()}</>
                  )}
                </span>
              </div>
            </div>
          )}

          {/* User Patterns */}
          {report && report.userPatterns.length > 0 && (
            <div className="metrics-section">
              <h3>Top User Patterns</h3>
              <div className="user-patterns">
                {report.userPatterns.slice(0, 5).map((pattern, index) => (
                  <div key={pattern.userId} className="pattern-item">
                    <div className="pattern-rank">#{index + 1}</div>
                    <div className="pattern-details">
                      <div className="pattern-user">User: {pattern.userId.substring(0, 8)}...</div>
                      <div className="pattern-stats">
                        {pattern.sessionCount} sessions • {formatPercentage(pattern.recoverySuccessRate)} success • {pattern.mostCommonState}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="metrics-section">
            <h3>Actions</h3>
            <div className="action-buttons">
              <button onClick={handleClearMetrics} className="btn-clear">
                🗑️ Clear All Metrics
              </button>
              <button onClick={handleExportMetrics} className="btn-export-full">
                📋 Export Full Report
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PerformanceDashboard;