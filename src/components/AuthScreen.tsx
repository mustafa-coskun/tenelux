import React, { useState, useEffect } from 'react';
import { getUserService } from '../services/UserService';
import { getAvatarService, AvatarOption } from '../services/AvatarService';
import { BackgroundEffects } from './BackgroundEffects';
import { LoadingSpinner } from './LoadingSpinner';
import { useTranslation, SupportedLanguage } from '../hooks/useTranslation';
import { useViewportSize } from '../hooks';
import { getEnvironmentService } from '../config/environment';
import { getServerUserService } from '../services/ServerUserService';
import teneluxLongBg from '../assets/tenelux_long.png';
import teneluxWideBg from '../assets/tenelux_wide.png';
import teneluxLogo from '../assets/tenelux.png';
import './AuthScreen.css';

interface AuthScreenProps {
  onAuthSuccess: () => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onAuthSuccess }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState<AvatarOption | null>(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [usernameSuggestions, setUsernameSuggestions] = useState<string[]>([]);
  const [backgroundOpacity] = useState(0.4);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [showLanguageMenu, setShowLanguageMenu] = useState(false);

  const userService = getUserService();
  const avatarService = getAvatarService();
  const { t, currentLanguage, changeLanguage, supportedLanguages } = useTranslation();
  const { isMobile, isTablet, width } = useViewportSize();

  // Choose background based on screen size
  const getBackgroundImage = () => {
    const isWideScreen = width >= 1200; // Desktop and wide screens
    const isMobileView = width <= 768; // Mobile and tablet

    if (isWideScreen) {
      return teneluxWideBg; // Wide background for desktop
    } else if (isMobileView) {
      return teneluxLongBg; // Long background for mobile
    } else {
      return teneluxWideBg; // Wide background for tablet landscape
    }
  };

  // Input sanitization for security
  const sanitizeInput = (input: string): string => {
    return input
      .trim()
      .replace(/[<>'"&]/g, '') // Remove potential XSS characters
      .replace(/[;-]/g, '') // Remove SQL injection patterns
      .replace(/--/g, '') // Remove SQL comment patterns
      .substring(0, 100); // Limit length
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      // Sanitize inputs
      const cleanUsername = sanitizeInput(username);
      const cleanDisplayName = sanitizeInput(displayName);

      // Basic validation
      if (!cleanUsername) {
        throw new Error(t('auth.usernameRequired'));
      }

      if (!password) {
        throw new Error(t('auth.passwordRequired'));
      }

      if (!isLogin) {
        // Signup validations only
        if (password !== confirmPassword) {
          throw new Error(t('auth.passwordMismatch'));
        }

        if (password.length < 6) {
          throw new Error(t('auth.passwordTooShort'));
        }

        if (!cleanDisplayName) {
          throw new Error(t('auth.displayNameRequired'));
        }

        // Basic username format validation only (no availability check)
        if (cleanUsername.length < 3) {
          throw new Error(t('auth.usernameTooShort'));
        }

        if (cleanUsername.length > 20) {
          throw new Error(t('auth.usernameTooLong'));
        }

        if (!/^[a-zA-Z0-9_-]+$/.test(cleanUsername)) {
          throw new Error(t('auth.usernameInvalidChars'));
        }

        if (/^\d/.test(cleanUsername)) {
          throw new Error(t('auth.usernameCannotStartWithNumber'));
        }

        // Username availability will be checked by server
      }

      // Simüle edilmiş authentication
      await new Promise(resolve => setTimeout(resolve, 1000));

      if (isLogin) {
        // Login - call real API
        const envService = getEnvironmentService();
        const apiUrl = envService.getConfig().apiUrl;
        const response = await fetch(`${apiUrl}/api/auth/login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            username: cleanUsername,
            password: password,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || t('auth.loginFailed'));
        }

        // Save session using ServerUserService
        const serverUserService = getServerUserService();
        await serverUserService.setCurrentUser(data.user, data.sessionToken);
        console.log('🔑 Session saved via ServerUserService');

        // Create user from server response for local UserService compatibility
        userService.createUser(data.user.username, data.user.displayName, false, true);
        if (data.user.avatar) {
          userService.updateAvatar(data.user.avatar);
        }
      } else {
        // Signup - call real API
        const envService = getEnvironmentService();
        const apiUrl = envService.getConfig().apiUrl;
        const response = await fetch(`${apiUrl}/api/auth/register`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            username: cleanUsername,
            displayName: cleanDisplayName,
            password: password,
            avatar: selectedAvatar?.emoji || avatarService.getRandomAvatar().emoji,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || t('auth.registrationFailed'));
        }

        // Registration successful - user needs to login
        setIsLogin(true);
        setError('');
        setPassword('');
        setConfirmPassword('');
        alert(data.message || 'Registration successful! Please login.');
        return; // Don't proceed to onAuthSuccess, user needs to login
      }

      // Session oluştur
      userService.createSession('menu');

      onAuthSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.errorOccurred'));
    } finally {
      setIsLoading(false);
    }
  };

  const toggleMode = () => {
    setIsLogin(!isLogin);
    setError('');
    setPassword('');
    setConfirmPassword('');
    setDisplayName('');
    setSelectedAvatar(null);
    setUsernameSuggestions([]);
  };

  const handleUsernameChange = (value: string) => {
    setUsername(value);
    setUsernameSuggestions([]);
    setError('');
  };

  return (
    <div
      className={`auth-screen with-background ${isMobile ? 'mobile' : ''} ${isTablet ? 'tablet' : ''}`}
      style={{
        backgroundImage: `
          linear-gradient(
            135deg, 
            rgba(26, 26, 46, ${backgroundOpacity}) 0%, 
            rgba(22, 33, 62, ${backgroundOpacity + 0.1}) 50%, 
            rgba(15, 52, 96, ${backgroundOpacity}) 100%
          ),
          url(${getBackgroundImage()})
        `
      }}
    >
      <BackgroundEffects variant="auth" />

      {/* Language Selector */}
      <div className="auth-language-selector">
        <button
          className="language-button"
          onClick={() => setShowLanguageMenu(!showLanguageMenu)}
        >
          🌐 {supportedLanguages[currentLanguage]}
        </button>
        {showLanguageMenu && (
          <div className="language-dropdown">
            {Object.entries(supportedLanguages).map(([code, name]) => (
              <button
                key={code}
                className={`language-option ${code === currentLanguage ? 'active' : ''}`}
                onClick={() => {
                  changeLanguage(code as SupportedLanguage);
                  setShowLanguageMenu(false);
                }}
              >
                {name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="auth-container">
        <div className="auth-header">
          <h1 className="tenelux-title size-medium">TENELUX</h1>
          <p className="tenelux-subtitle size-medium">SHADOWS OF PACTA</p>
        </div>

        <div className="auth-form-container">
          <div className="auth-tabs">
            <button
              className={`auth-tab ${isLogin ? 'active' : ''}`}
              onClick={() => setIsLogin(true)}
            >
              {t('auth.login')}
            </button>
            <button
              className={`auth-tab ${!isLogin ? 'active' : ''}`}
              onClick={() => setIsLogin(false)}
            >
              {t('auth.signup')}
            </button>
          </div>

          <form onSubmit={handleSubmit} className="auth-form">
            <div className="form-group">
              <label htmlFor="username">
                {t('auth.username')} {!isLogin && <span className="required">{t('auth.required')}</span>}
              </label>
              <input
                type="text"
                id="username"
                value={username}
                onChange={(e) => handleUsernameChange(e.target.value)}
                placeholder={isLogin ? t('auth.usernamePlaceholderLogin') : t('auth.usernamePlaceholderSignup')}
                disabled={isLoading}
              />
              {!isLogin && (
                <small className="field-hint">
                  {t('auth.usernameHint')}
                </small>
              )}

              {usernameSuggestions.length > 0 && (
                <div className="username-suggestions">
                  <p>{t('auth.suggestedUsernames')}</p>
                  <div className="suggestions-list">
                    {usernameSuggestions.map((suggestion, index) => (
                      <button
                        key={index}
                        type="button"
                        className="suggestion-btn"
                        onClick={() => handleUsernameChange(suggestion)}
                        disabled={isLoading}
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {!isLogin && (
              <div className="form-group">
                <label htmlFor="displayName">
                  {t('auth.displayName')} <span className="required">{t('auth.required')}</span>
                </label>
                <input
                  type="text"
                  id="displayName"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder={t('auth.displayNamePlaceholder')}
                  disabled={isLoading}
                />
                <small className="field-hint">
                  {t('auth.displayNameHint')}
                </small>
              </div>
            )}

            <div className="form-group">
              <label htmlFor="password">{t('auth.password')}</label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('auth.passwordPlaceholder')}
                disabled={isLoading}
              />
            </div>

            {!isLogin && (
              <div className="form-group">
                <label htmlFor="confirmPassword">{t('auth.confirmPassword')}</label>
                <input
                  type="password"
                  id="confirmPassword"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder={t('auth.confirmPasswordPlaceholder')}
                  disabled={isLoading}
                />
              </div>
            )}

            {!isLogin && (
              <div className="form-group">
                <label>{t('auth.selectAvatar')}</label>
                <div className="avatar-selector">
                  {avatarService.getAllAvatars().slice(0, 12).map((avatar) => (
                    <button
                      key={avatar.id}
                      type="button"
                      className={`avatar-option ${selectedAvatar?.id === avatar.id ? 'selected' : ''}`}
                      onClick={() => setSelectedAvatar(avatar)}
                      disabled={isLoading}
                      title={avatar.name}
                    >
                      {avatar.emoji}
                    </button>
                  ))}
                </div>
                <small className="field-hint">
                  {selectedAvatar ? t('auth.selectedAvatar', { name: selectedAvatar.name }) : t('auth.randomAvatar')}
                </small>
              </div>
            )}

            {error && <div className="error-message">{error}</div>}

            {isLoading ? (
              <LoadingSpinner
                size="small"
                variant="auth"
                message={isLogin ? t('auth.loggingIn') : t('auth.creatingAccount')}
              />
            ) : (
              <button
                type="submit"
                className="auth-submit-btn"
              >
                {isLogin ? t('auth.loginButton') : t('auth.signupButton')}
              </button>
            )}
          </form>

          <div className="auth-footer">
            <p>
              {isLogin ? t('auth.noAccount') : t('auth.alreadyHaveAccount')}
              <button
                type="button"
                className="auth-toggle-btn"
                onClick={toggleMode}
                disabled={isLoading}
              >
                {isLogin ? t('auth.signupButton') : t('auth.loginButton')}
              </button>
            </p>
          </div>

          <div className="guest-login">
            <button
              type="button"
              className="guest-btn"
              onClick={() => {
                const guestName = `Misafir_${Date.now().toString().slice(-6)}`;
                userService.createUser(guestName, guestName, true); // isGuest = true
                userService.createSession('menu');
                onAuthSuccess();
              }}
              disabled={isLoading}
            >
              {t('auth.guestLogin')}
            </button>
          </div>


        </div>
      </div>
    </div>
  );
};