import React, { useState } from 'react';
import { getErrorHandler } from '../services/ErrorHandler';
import { getNotificationService } from '../services/NotificationService';
import { getSessionDebugger } from '../services/SessionDebugger';
import NotificationCenter from '../components/NotificationCenter';
import DebugPanel from '../components/DebugPanel';

/**
 * Example component showing how to integrate the new error handling and user feedback systems
 * This demonstrates the proper usage patterns for the comprehensive error handling implementation
 */
const ErrorHandlingIntegration: React.FC = () => {
  const [isDebugPanelOpen, setIsDebugPanelOpen] = useState(false);
  const errorHandler = getErrorHandler();
  const notificationService = getNotificationService();
  const sessionDebugger = getSessionDebugger();

  // Example: Handle a session recovery operation with comprehensive error handling
  const handleSessionRecovery = async () => {
    const loadingId = notificationService.showSessionRecoveryLoading();
    
    try {
      // Simulate session recovery with error handling
      await errorHandler.retryOperation(
        async () => {
          // Simulate potential failure
          if (Math.random() > 0.7) {
            throw new Error('Network connection failed');
          }
          
          // Simulate successful recovery
          await new Promise(resolve => setTimeout(resolve, 2000));
          return { success: true, data: 'recovered session' };
        },
        'Session Recovery',
        3, // max retries
        { userId: 'example_user', operation: 'session_recovery' }
      );
      
      // Hide loading and show success
      notificationService.hideLoading(loadingId);
      notificationService.showSessionRecoverySuccess('lobby');
      
    } catch (error) {
      // Hide loading and show error with actions
      notificationService.hideLoading(loadingId);
      notificationService.showSessionRecoveryFailed(
        error instanceof Error ? error.message : 'Unknown error',
        [
          {
            label: 'Retry',
            action: () => handleSessionRecovery(),
            style: 'primary'
          },
          {
            label: 'Go to Menu',
            action: () => console.log('Navigate to menu'),
            style: 'secondary'
          }
        ]
      );
    }
  };

  // Example: Validate session data with comprehensive validation
  const handleValidateSession = async () => {
    try {
      // Example session data (normally would come from storage)
      const sessionData = {
        user: {
          id: 'user_123',
          name: 'Test User',
          createdAt: new Date(),
          lastActive: new Date()
        },
        gameSession: {
          userId: 'user_123',
          currentState: 'lobby',
          lobbyId: 'lobby_456',
          lastUpdated: new Date()
        },
        timestamp: Date.now(),
        version: '1.0.0'
      };

      // Use the validation service through error handler
      const result = await errorHandler.withTimeout(
        (async () => {
          const { getValidationService } = await import('../services/ValidationService');
          const validationService = getValidationService();
          return await validationService.validateStoredSession(sessionData);
        })(),
        5000 // 5 second timeout
      );

      if (result.isValid) {
        notificationService.success(
          'Validation Successful',
          'Session data is valid and can be used for recovery.'
        );
      } else {
        notificationService.showValidationError(result.errors);
      }

    } catch (error) {
      errorHandler.createError(
        'VALIDATION_ERROR' as any,
        'Session validation failed',
        { error },
        { operation: 'validate_session' }
      );
    }
  };

  // Example: Simulate different types of errors
  const simulateError = (errorType: string) => {
    switch (errorType) {
      case 'network':
        errorHandler.createError(
          'NETWORK_ERROR' as any,
          'Failed to connect to server',
          { code: 'ECONNREFUSED', timeout: 5000 },
          { operation: 'connect_websocket' }
        );
        break;
        
      case 'storage':
        errorHandler.createError(
          'STORAGE_ERROR' as any,
          'localStorage quota exceeded',
          { quota: '5MB', used: '5.2MB' },
          { operation: 'save_session' }
        );
        break;
        
      case 'session_expired':
        errorHandler.createError(
          'SESSION_EXPIRED' as any,
          'Session has expired after 24 hours',
          { age: '25 hours', maxAge: '24 hours' },
          { userId: 'user_123', operation: 'load_session' }
        );
        break;
        
      case 'corruption':
        errorHandler.createError(
          'SESSION_CORRUPTED' as any,
          'Session data structure is invalid',
          { expectedVersion: '1.0.0', actualVersion: 'unknown' },
          { operation: 'parse_session' }
        );
        break;
    }
  };

  // Example: Performance monitoring
  const performSlowOperation = async () => {
    try {
      const result = await sessionDebugger.measureAsyncPerformance(
        'Slow Database Operation',
        async () => {
          // Simulate slow operation
          await new Promise(resolve => setTimeout(resolve, 3000));
          return { records: 100, processed: true };
        }
      );
      
      notificationService.success(
        'Operation Complete',
        `Processed ${result.records} records successfully.`
      );
      
    } catch (error) {
      notificationService.error(
        'Operation Failed',
        'The database operation could not be completed.'
      );
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <h1>🔧 Error Handling & User Feedback Integration Example</h1>
      
      <div style={{ marginBottom: '20px' }}>
        <p>
          This example demonstrates the comprehensive error handling and user feedback systems.
          All notifications will appear in the top-right corner, and errors are logged for debugging.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '20px' }}>
        <button 
          onClick={handleSessionRecovery}
          style={{ padding: '12px', backgroundColor: '#2196f3', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
        >
          🔄 Test Session Recovery
        </button>
        
        <button 
          onClick={handleValidateSession}
          style={{ padding: '12px', backgroundColor: '#4caf50', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
        >
          ✅ Validate Session Data
        </button>
        
        <button 
          onClick={performSlowOperation}
          style={{ padding: '12px', backgroundColor: '#ff9800', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
        >
          ⏱️ Performance Test
        </button>
        
        <button 
          onClick={() => setIsDebugPanelOpen(true)}
          style={{ padding: '12px', backgroundColor: '#9c27b0', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
        >
          🔧 Open Debug Panel
        </button>
      </div>

      <h3>Error Simulation</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '8px', marginBottom: '20px' }}>
        <button 
          onClick={() => simulateError('network')}
          style={{ padding: '8px', backgroundColor: '#f44336', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
        >
          📡 Network Error
        </button>
        
        <button 
          onClick={() => simulateError('storage')}
          style={{ padding: '8px', backgroundColor: '#f44336', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
        >
          💾 Storage Error
        </button>
        
        <button 
          onClick={() => simulateError('session_expired')}
          style={{ padding: '8px', backgroundColor: '#f44336', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
        >
          ⏰ Session Expired
        </button>
        
        <button 
          onClick={() => simulateError('corruption')}
          style={{ padding: '8px', backgroundColor: '#f44336', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
        >
          🔧 Data Corruption
        </button>
      </div>

      <h3>Quick Actions</h3>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button 
          onClick={() => notificationService.clear()}
          style={{ padding: '8px 12px', backgroundColor: '#666', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
        >
          Clear Notifications
        </button>
        
        <button 
          onClick={() => errorHandler.clearHistory()}
          style={{ padding: '8px 12px', backgroundColor: '#666', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
        >
          Clear Error History
        </button>
        
        <button 
          onClick={() => sessionDebugger.enableLogging(!sessionDebugger.getLogs().length)}
          style={{ padding: '8px 12px', backgroundColor: '#666', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
        >
          Toggle Debug Logging
        </button>
      </div>

      <div style={{ marginTop: '20px', padding: '16px', backgroundColor: '#f5f5f5', borderRadius: '6px' }}>
        <h4>Console Commands</h4>
        <p style={{ fontSize: '14px', margin: '8px 0' }}>
          Open browser console and try these commands:
        </p>
        <ul style={{ fontSize: '12px', fontFamily: 'monospace', margin: 0 }}>
          <li><code>TenebrisDebug.getStats()</code> - Get session statistics</li>
          <li><code>TenebrisDebug.exportData()</code> - Export debug data</li>
          <li><code>TenebrisDebug.enableLogging(true)</code> - Enable debug logging</li>
          <li><code>TenebrisDebug.simulateError('network')</code> - Simulate errors</li>
        </ul>
      </div>

      {/* Notification Center - handles all user notifications */}
      <NotificationCenter />
      
      {/* Debug Panel - comprehensive debugging interface */}
      <DebugPanel 
        isOpen={isDebugPanelOpen} 
        onClose={() => setIsDebugPanelOpen(false)} 
      />
    </div>
  );
};

export default ErrorHandlingIntegration;