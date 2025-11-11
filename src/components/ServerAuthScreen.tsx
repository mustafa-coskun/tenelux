import React, { useState, useEffect } from 'react';
import { getServerUserService } from '../services/ServerUserService';
import { getAvatarService, AvatarOption } from '../services/AvatarService';
import { BackgroundEffects } from './BackgroundEffects';
import { LoadingSpinner } from './LoadingSpinner';
import { useTranslation, SupportedLanguage } from '../hooks/useTranslation';
import teneluxLongBg from '../assets/tenelux_long.png';
import teneluxWideBg from '../assets/tenelux_wide.png';
import teneluxLogo from '../assets/tenelux.png';
import './AuthScreen.css';

interface ServerAuthScreenProps {
    onAuthSuccess: () => void;
}

export const ServerAuthScreen: React.FC<ServerAuthScreenProps> = ({ onAuthSuccess }) => {
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
    const [usernameValidation, setUsernameValidation] = useState<{ valid: boolean; error?: string }>({ valid: true });

    const serverUserService = getServerUserService();
    const avatarService = getAvatarService();
    const { t, currentLanguage, changeLanguage, supportedLanguages } = useTranslation();

    // Window resize listener for responsive background
    useEffect(() => {
        const handleResize = () => setWindowWidth(window.innerWidth);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Choose background based on screen size
    const getBackgroundImage = () => {
        const isWideScreen = windowWidth >= 1200;
        const isMobile = windowWidth <= 768;

        if (isWideScreen) {
            return teneluxWideBg;
        } else if (isMobile) {
            return teneluxLongBg;
        } else {
            return teneluxWideBg;
        }
    };



    // Check if user is already logged in
    useEffect(() => {
        if (serverUserService.isLoggedIn()) {
            onAuthSuccess();
        }
    }, [serverUserService, onAuthSuccess]);

    // Username validation with debounce
    useEffect(() => {
        if (!isLogin && username.length >= 3) {
            const timeoutId = setTimeout(async () => {
                const validation = await serverUserService.validateUsername(username);
                setUsernameValidation(validation);
                if (!validation.valid && validation.suggestions) {
                    setUsernameSuggestions(validation.suggestions);
                } else {
                    setUsernameSuggestions([]);
                }
            }, 500);

            return () => clearTimeout(timeoutId);
        } else {
            setUsernameValidation({ valid: true });
            setUsernameSuggestions([]);
        }
    }, [username, isLogin, serverUserService]);



    const validateForm = (): boolean => {
        setError('');

        if (isLogin) {
            if (!username.trim()) {
                setError(t('auth.usernameRequired'));
                return false;
            }
            if (!password) {
                setError(t('auth.passwordRequired'));
                return false;
            }
        } else {
            if (!username.trim()) {
                setError(t('auth.usernameRequired'));
                return false;
            }
            if (!usernameValidation.valid) {
                setError(usernameValidation.error || 'Geçersiz kullanıcı adı');
                return false;
            }
            if (!displayName.trim()) {
                setError(t('auth.displayNameRequired'));
                return false;
            }
            if (!password) {
                setError(t('auth.passwordRequired'));
                return false;
            }
            if (password.length < 6) {
                setError(t('auth.passwordTooShort'));
                return false;
            }
            if (password !== confirmPassword) {
                setError(t('auth.passwordMismatch'));
                return false;
            }
        }

        return true;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!validateForm()) return;

        setIsLoading(true);
        setError('');

        try {
            let result;

            if (isLogin) {
                result = await serverUserService.login(username, password);
            } else {
                result = await serverUserService.register(username, displayName, password);

                // Update avatar if selected
                if (result.success && selectedAvatar) {
                    await serverUserService.updateProfile({ avatar: selectedAvatar.emoji });
                }
            }

            if (result.success) {
                onAuthSuccess();
            } else {
                setError(result.error || (isLogin ? 'Giriş başarısız' : 'Kayıt başarısız'));
            }
        } catch (error) {
            setError(error instanceof Error ? error.message : 'Bir hata oluştu');
        } finally {
            setIsLoading(false);
        }
    };

    const handleGuestLogin = async () => {
        setIsLoading(true);
        setError('');

        try {
            const result = await serverUserService.loginAsGuest(displayName || undefined);

            if (result.success) {
                // Update avatar if selected
                if (selectedAvatar) {
                    await serverUserService.updateProfile({ avatar: selectedAvatar.emoji });
                }
                onAuthSuccess();
            } else {
                setError(result.error || 'Misafir girişi başarısız');
            }
        } catch (error) {
            setError(error instanceof Error ? error.message : 'Bir hata oluştu');
        } finally {
            setIsLoading(false);
        }
    };



    const handleSuggestionClick = (suggestion: string) => {
        setUsername(suggestion);
        setUsernameSuggestions([]);
    };

    const toggleMode = () => {
        setIsLogin(!isLogin);
        setError('');
        setUsername('');
        setDisplayName('');
        setPassword('');
        setConfirmPassword('');
        setSelectedAvatar(null);
        setUsernameSuggestions([]);
    };

    return (
        <div
            className="auth-screen with-background"
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

                {/* Auth Form */}
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
                        {/* Username Field */}
                        <div className="form-group">
                            <label htmlFor="username">
                                {t('auth.username')} <span className="required">{t('auth.required')}</span>
                            </label>
                            <input
                                id="username"
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                placeholder={isLogin ? t('auth.usernamePlaceholderLogin') : t('auth.usernamePlaceholderSignup')}
                                disabled={isLoading}
                                className={!usernameValidation.valid ? 'error' : ''}
                            />
                            {!isLogin && (
                                <small className="form-hint">{t('auth.usernameHint')}</small>
                            )}
                            {!usernameValidation.valid && (
                                <div className="error-text">{usernameValidation.error}</div>
                            )}
                        </div>

                        {/* Username Suggestions */}
                        {usernameSuggestions.length > 0 && (
                            <div className="username-suggestions">
                                <small>{t('auth.suggestedUsernames')}</small>
                                <div className="suggestions-list">
                                    {usernameSuggestions.map((suggestion, index) => (
                                        <button
                                            key={index}
                                            type="button"
                                            className="suggestion-button"
                                            onClick={() => handleSuggestionClick(suggestion)}
                                        >
                                            {suggestion}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Display Name Field (Signup only) */}
                        {!isLogin && (
                            <div className="form-group">
                                <label htmlFor="displayName">
                                    {t('auth.displayName')} <span className="required">{t('auth.required')}</span>
                                </label>
                                <input
                                    id="displayName"
                                    type="text"
                                    value={displayName}
                                    onChange={(e) => setDisplayName(e.target.value)}
                                    placeholder={t('auth.displayNamePlaceholder')}
                                    disabled={isLoading}
                                />
                                <small className="form-hint">{t('auth.displayNameHint')}</small>
                            </div>
                        )}

                        {/* Avatar Selection (Signup only) */}
                        {!isLogin && (
                            <div className="form-group">
                                <label>{t('auth.selectAvatar')}</label>
                                <div className="avatar-selection">
                                    {avatarService.getAllAvatars().slice(0, 8).map((avatar) => (
                                        <button
                                            key={avatar.id}
                                            type="button"
                                            className={`avatar-option ${selectedAvatar?.id === avatar.id ? 'selected' : ''}`}
                                            onClick={() => setSelectedAvatar(avatar)}
                                            title={avatar.name}
                                        >
                                            {avatar.emoji}
                                        </button>
                                    ))}
                                </div>
                                {selectedAvatar ? (
                                    <small className="avatar-selected">
                                        {t('auth.selectedAvatar', { name: selectedAvatar.name })}
                                    </small>
                                ) : (
                                    <small className="form-hint">{t('auth.randomAvatar')}</small>
                                )}
                            </div>
                        )}

                        {/* Password Field */}
                        <div className="form-group">
                            <label htmlFor="password">
                                {t('auth.password')} <span className="required">{t('auth.required')}</span>
                            </label>
                            <input
                                id="password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder={t('auth.passwordPlaceholder')}
                                disabled={isLoading}
                            />
                        </div>

                        {/* Confirm Password Field (Signup only) */}
                        {!isLogin && (
                            <div className="form-group">
                                <label htmlFor="confirmPassword">
                                    {t('auth.confirmPassword')} <span className="required">{t('auth.required')}</span>
                                </label>
                                <input
                                    id="confirmPassword"
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    placeholder={t('auth.confirmPasswordPlaceholder')}
                                    disabled={isLoading}
                                />
                            </div>
                        )}

                        {/* Error Message */}
                        {error && <div className="error-message">{error}</div>}

                        {/* Submit Button */}
                        <button
                            type="submit"
                            className="auth-submit-button"
                            disabled={isLoading || (!isLogin && !usernameValidation.valid)}
                        >
                            {isLoading ? (
                                <LoadingSpinner size="small" />
                            ) : (
                                isLogin ? t('auth.loginButton') : t('auth.signupButton')
                            )}
                        </button>

                        {/* Alternative Actions */}
                        <div className="auth-alternatives">
                            <button
                                type="button"
                                className="guest-button"
                                onClick={handleGuestLogin}
                                disabled={isLoading}
                            >
                                {t('auth.guestLogin')}
                            </button>
                        </div>

                        {/* Toggle Mode */}
                        <div className="auth-toggle">
                            {isLogin ? (
                                <p>
                                    {t('auth.noAccount')}{' '}
                                    <button type="button" onClick={toggleMode} className="link-button">
                                        {t('auth.signup')}
                                    </button>
                                </p>
                            ) : (
                                <p>
                                    {t('auth.alreadyHaveAccount')}{' '}
                                    <button type="button" onClick={toggleMode} className="link-button">
                                        {t('auth.login')}
                                    </button>
                                </p>
                            )}
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};