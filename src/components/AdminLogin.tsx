import React, { useState } from 'react';
import { getAdminAuthService } from '../services/AdminAuthService';
import './AdminLogin.css';

interface AdminLoginProps {
  onLoginSuccess: () => void;
  onCancel: () => void;
}

const AdminLogin: React.FC<AdminLoginProps> = ({ onLoginSuccess, onCancel }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showCredentials, setShowCredentials] = useState(false);

  const adminAuthService = getAdminAuthService();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!username.trim() || !password.trim()) {
      setError('Kullanıcı adı ve şifre gereklidir');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const result = await adminAuthService.login(username.trim(), password);
      
      if (result.success) {
        onLoginSuccess();
      } else {
        setError(result.error || 'Giriş başarısız');
      }
    } catch (error) {
      setError('Giriş işlemi sırasında hata oluştu');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDemoLogin = async (role: 'admin' | 'moderator') => {
    const credentials = {
      admin: { username: 'admin', password: 'TenebrisAdmin2024!' },
      moderator: { username: 'moderator', password: 'TenebrisMod2024!' }
    };

    setUsername(credentials[role].username);
    setPassword(credentials[role].password);
    setError('');
  };

  return (
    <div className="admin-login-overlay">
      <div className="admin-login-modal">
        <div className="admin-login-header">
          <h2>🔐 Admin Girişi</h2>
          <button onClick={onCancel} className="close-button">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="admin-login-form">
          <div className="form-group">
            <label htmlFor="username">Kullanıcı Adı:</label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Admin kullanıcı adı"
              disabled={isLoading}
              autoComplete="username"
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Şifre:</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Admin şifresi"
              disabled={isLoading}
              autoComplete="current-password"
            />
          </div>

          {error && (
            <div className="error-message">
              ⚠️ {error}
            </div>
          )}

          <div className="form-actions">
            <button
              type="submit"
              disabled={isLoading}
              className="login-button"
            >
              {isLoading ? '🔄 Giriş yapılıyor...' : '🔑 Giriş Yap'}
            </button>
            
            <button
              type="button"
              onClick={onCancel}
              disabled={isLoading}
              className="cancel-button"
            >
              İptal
            </button>
          </div>
        </form>

        <div className="demo-section">
          <button
            type="button"
            onClick={() => setShowCredentials(!showCredentials)}
            className="demo-toggle"
          >
            {showCredentials ? '🙈 Demo Bilgilerini Gizle' : '👁️ Demo Bilgilerini Göster'}
          </button>

          {showCredentials && (
            <div className="demo-credentials">
              <h4>Demo Hesapları:</h4>
              
              <div className="demo-account">
                <div className="demo-info">
                  <strong>Super Admin:</strong>
                  <br />
                  Kullanıcı: admin
                  <br />
                  Şifre: TenebrisAdmin2024!
                  <br />
                  <small>Tüm yetkilere sahip</small>
                </div>
                <button
                  onClick={() => handleDemoLogin('admin')}
                  className="demo-button admin"
                >
                  Admin Olarak Giriş
                </button>
              </div>

              <div className="demo-account">
                <div className="demo-info">
                  <strong>Moderatör:</strong>
                  <br />
                  Kullanıcı: moderator
                  <br />
                  Şifre: TenebrisMod2024!
                  <br />
                  <small>Sınırlı yetkiler</small>
                </div>
                <button
                  onClick={() => handleDemoLogin('moderator')}
                  className="demo-button moderator"
                >
                  Moderatör Olarak Giriş
                </button>
              </div>

              <div className="demo-warning">
                ⚠️ Bu demo hesapları sadece geliştirme amaçlıdır. 
                Üretim ortamında güvenli kimlik doğrulama kullanın.
              </div>
            </div>
          )}
        </div>

        <div className="security-notice">
          <small>
            🛡️ Bu panel sadece yetkili sistem yöneticileri içindir.
            Tüm aktiviteler loglanmaktadır.
          </small>
        </div>
      </div>
    </div>
  );
};

export default AdminLogin;