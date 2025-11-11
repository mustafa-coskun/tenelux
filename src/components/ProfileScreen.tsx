import React, { useState, useRef } from 'react';
import { getServerUserService } from '../services/ServerUserService';
import { User } from '../services/UserService';
import { getAvatarService, AvatarOption } from '../services/AvatarService';
import { useTranslation } from '../hooks/useTranslation';
import { useViewportSize } from '../hooks';
import FriendsManager from './FriendsManager';
import './ProfileScreen.css';

interface ProfileScreenProps {
    onClose: () => void;
    currentUser: User;
}

export const ProfileScreen: React.FC<ProfileScreenProps> = ({ onClose, currentUser }) => {
    const [activeTab, setActiveTab] = useState<'profile' | 'stats' | 'friends'>('profile');
    const [displayName, setDisplayName] = useState(currentUser.displayName);
    const [selectedAvatar, setSelectedAvatar] = useState<AvatarOption | null>(null);
    const [customAvatar, setCustomAvatar] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [showFriendsManager, setShowFriendsManager] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const serverUserService = getServerUserService();
    const avatarService = getAvatarService();
    const { t } = useTranslation();

    const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        // Dosya boyutu kontrolü (max 2MB)
        const maxSize = 2 * 1024 * 1024; // 2MB
        if (file.size > maxSize) {
            setError(t('profile.fileSizeError'));
            return;
        }

        // Dosya tipi kontrolü
        if (!file.type.startsWith('image/')) {
            setError(t('profile.fileTypeError'));
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const result = e.target?.result as string;
            setCustomAvatar(result);
            setSelectedAvatar(null);
            setError('');
        };
        reader.readAsDataURL(file);
    };

    const handleSave = async () => {
        setIsLoading(true);
        setError('');
        setSuccess('');

        try {
            const updates: { displayName?: string; avatar?: string } = {};

            // Display name güncelle
            if (displayName.trim() !== currentUser.displayName) {
                updates.displayName = displayName.trim();
            }

            // Avatar güncelle
            if (customAvatar) {
                updates.avatar = customAvatar;
            } else if (selectedAvatar) {
                updates.avatar = selectedAvatar.emoji;
            }

            if (Object.keys(updates).length > 0) {
                const success = await serverUserService.updateProfile(updates);
                if (!success) {
                    throw new Error(t('profile.updateError'));
                }
            }

            setSuccess(t('profile.profileUpdated'));
            setTimeout(() => {
                onClose();
            }, 1500);
        } catch (err) {
            setError(err instanceof Error ? err.message : t('profile.generalError'));
        } finally {
            setIsLoading(false);
        }
    };

    const getCurrentAvatar = () => {
        if (customAvatar) return customAvatar;
        if (selectedAvatar) return selectedAvatar.emoji;
        return currentUser.avatar;
    };

    const isAvatarImage = (avatar: string | null) => {
        return avatar && (avatar.startsWith('data:image/') || avatar.startsWith('http'));
    };

    const { isMobile, isTablet } = useViewportSize();

    return (
        <div className="profile-overlay">
            <div className={`profile-container ${isMobile ? 'mobile' : ''} ${isTablet ? 'tablet' : ''}`}>
                <div className="profile-header">
                    <h2 className="title size-small">{t('profile.title').toUpperCase()}</h2>
                    <button className="close-button" onClick={onClose}>✕</button>
                </div>

                {/* Tab Navigation */}
                <div className="tab-navigation">
                    <button 
                        className={`tab-button ${activeTab === 'profile' ? 'active' : ''}`}
                        onClick={() => setActiveTab('profile')}
                    >
                        👤 {t('profile.profileTab')}
                    </button>
                    <button 
                        className={`tab-button ${activeTab === 'stats' ? 'active' : ''}`}
                        onClick={() => setActiveTab('stats')}
                    >
                        📊 {t('profile.statisticsTab')}
                    </button>
                    <button 
                        className={`tab-button ${activeTab === 'friends' ? 'active' : ''}`}
                        onClick={() => setActiveTab('friends')}
                    >
                        👥 {t('friends.title')}
                    </button>
                </div>

                <div className="profile-content">
                    {activeTab === 'profile' && (
                        <>
                            {/* Avatar Section */}
                            <div className="avatar-section">
                                <h3>{t('profile.avatar')}</h3>
                                <div className="current-avatar">
                                    {isAvatarImage(getCurrentAvatar()) ? (
                                        <img
                                            src={getCurrentAvatar()}
                                            alt="Avatar"
                                            className="avatar-image"
                                        />
                                    ) : (
                                        <div className="avatar-emoji">{getCurrentAvatar()}</div>
                                    )}
                                </div>

                                <div className="avatar-options">
                                    <h4>{t('profile.emojiAvatars')}</h4>
                                    <div className="emoji-grid">
                                        {avatarService.getAllAvatars().map((avatar) => (
                                            <button
                                                key={avatar.id}
                                                className={`emoji-option ${selectedAvatar?.id === avatar.id ? 'selected' : ''}`}
                                                onClick={() => {
                                                    setSelectedAvatar(avatar);
                                                    setCustomAvatar(null);
                                                }}
                                                title={avatar.name}
                                            >
                                                {avatar.emoji}
                                            </button>
                                        ))}
                                    </div>

                                    <div className="custom-avatar-section">
                                        <h4>{t('profile.customAvatar')}</h4>
                                        <input
                                            type="file"
                                            ref={fileInputRef}
                                            onChange={handleFileUpload}
                                            accept="image/*"
                                            style={{ display: 'none' }}
                                        />
                                        <button
                                            className="upload-btn"
                                            onClick={() => fileInputRef.current?.click()}
                                        >
                                            📁 {t('profile.uploadImage')}
                                        </button>
                                        {customAvatar && (
                                            <button
                                                className="remove-custom-btn"
                                                onClick={() => {
                                                    setCustomAvatar(null);
                                                    if (fileInputRef.current) {
                                                        fileInputRef.current.value = '';
                                                    }
                                                }}
                                            >
                                                🗑️ {t('profile.removeCustom')}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Profile Info Section */}
                            <div className="profile-info-section">
                                <h3>{t('profile.profileInfo')}</h3>

                                <div className="form-group">
                                    <label>{t('profile.username')}</label>
                                    <input
                                        type="text"
                                        value={currentUser.username}
                                        disabled
                                        className="readonly-input"
                                    />
                                    <small>{t('profile.usernameReadonly')}</small>
                                </div>

                                <div className="form-group">
                                    <label>{t('profile.displayName')}</label>
                                    <input
                                        type="text"
                                        value={displayName}
                                        onChange={(e) => setDisplayName(e.target.value)}
                                        placeholder={t('profile.displayNamePlaceholder')}
                                        maxLength={30}
                                    />
                                </div>
                            </div>
                        </>
                    )}

                    {activeTab === 'stats' && !currentUser.isGuest && (
                        <div className="statistics-section">
                            <h3>{t('profile.statistics')}</h3>
                            
                            {/* Detailed Stats */}
                            <div className="stats-categories">
                                {/* Genel İstatistikler */}
                                <div className="stats-category">
                                    <h4>🎮 {t('profile.generalStats')}</h4>
                                    <div className="stats-grid">
                                        <div className="stat-card">
                                            <div className="stat-icon">🎯</div>
                                            <div className="stat-info">
                                                <div className="stat-label">{t('profile.totalGames')}</div>
                                                <div className="stat-value">{currentUser.stats.totalGames}</div>
                                            </div>
                                        </div>
                                        <div className="stat-card">
                                            <div className="stat-icon">🏆</div>
                                            <div className="stat-info">
                                                <div className="stat-label">{t('profile.totalWins')}</div>
                                                <div className="stat-value">{currentUser.stats.wins}</div>
                                            </div>
                                        </div>
                                        <div className="stat-card">
                                            <div className="stat-icon">📈</div>
                                            <div className="stat-info">
                                                <div className="stat-label">{t('profile.winRate')}</div>
                                                <div className="stat-value">{currentUser.stats.winRate.toFixed(1)}%</div>
                                            </div>
                                        </div>
                                        <div className="stat-card">
                                            <div className="stat-icon">⭐</div>
                                            <div className="stat-info">
                                                <div className="stat-label">{t('profile.trustScore')}</div>
                                                <div className="stat-value">{currentUser.stats.trustScore}/100</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Skor İstatistikleri */}
                                <div className="stats-category">
                                    <h4>💰 {t('profile.scoreStats')}</h4>
                                    <div className="stats-grid">
                                        <div className="stat-card">
                                            <div className="stat-icon">💎</div>
                                            <div className="stat-info">
                                                <div className="stat-label">{t('profile.totalScore')}</div>
                                                <div className="stat-value">{currentUser.stats.totalScore.toLocaleString()}</div>
                                            </div>
                                        </div>
                                        <div className="stat-card">
                                            <div className="stat-icon">📊</div>
                                            <div className="stat-info">
                                                <div className="stat-label">{t('profile.averageScore')}</div>
                                                <div className="stat-value">{currentUser.stats.averageScore.toFixed(1)}</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Davranış İstatistikleri */}
                                <div className="stats-category">
                                    <h4>🤝 {t('profile.behaviorStats')}</h4>
                                    <div className="stats-grid">
                                        <div className="stat-card">
                                            <div className="stat-icon">🤝</div>
                                            <div className="stat-info">
                                                <div className="stat-label">{t('profile.cooperationRate')}</div>
                                                <div className="stat-value">
                                                    {currentUser.stats.totalGames > 0 
                                                        ? ((currentUser.stats.cooperations / (currentUser.stats.cooperations + currentUser.stats.betrayals)) * 100).toFixed(1)
                                                        : 0}%
                                                </div>
                                            </div>
                                        </div>
                                        <div className="stat-card">
                                            <div className="stat-icon">⚔️</div>
                                            <div className="stat-info">
                                                <div className="stat-label">{t('profile.betrayalRate')}</div>
                                                <div className="stat-value">{currentUser.stats.betrayalRate.toFixed(1)}%</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Seri İstatistikleri */}
                                <div className="stats-category">
                                    <h4>🔥 {t('profile.streakStats')}</h4>
                                    <div className="stats-grid">
                                        <div className="stat-card">
                                            <div className="stat-icon">🔥</div>
                                            <div className="stat-info">
                                                <div className="stat-label">{t('profile.currentWinStreak')}</div>
                                                <div className="stat-value">{currentUser.stats.currentWinStreak}</div>
                                            </div>
                                        </div>
                                        <div className="stat-card">
                                            <div className="stat-icon">🏅</div>
                                            <div className="stat-info">
                                                <div className="stat-label">{t('profile.longestWinStreak')}</div>
                                                <div className="stat-value">{currentUser.stats.longestWinStreak}</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Zaman İstatistikleri */}
                                <div className="stats-category">
                                    <h4>📅 {t('profile.timeStats')}</h4>
                                    <div className="stats-grid">
                                        <div className="stat-card">
                                            <div className="stat-icon">📅</div>
                                            <div className="stat-info">
                                                <div className="stat-label">{t('profile.gamesThisWeek')}</div>
                                                <div className="stat-value">{currentUser.stats.gamesThisWeek}</div>
                                            </div>
                                        </div>
                                        <div className="stat-card">
                                            <div className="stat-icon">🗓️</div>
                                            <div className="stat-info">
                                                <div className="stat-label">{t('profile.gamesThisMonth')}</div>
                                                <div className="stat-value">{currentUser.stats.gamesThisMonth}</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'stats' && currentUser.isGuest && (
                        <div className="guest-stats-message">
                            <div className="guest-icon">👤</div>
                            <h3>{t('profile.guestStatsTitle')}</h3>
                            <p>{t('profile.guestStatsMessage')}</p>
                        </div>
                    )}

                    {activeTab === 'friends' && (
                        <div className="friends-section">
                            {currentUser.isGuest ? (
                                <div className="guest-friends-message">
                                    <div className="guest-icon">👥</div>
                                    <h3>{t('friends.guestTitle')}</h3>
                                    <p>{t('friends.guestMessage')}</p>
                                </div>
                            ) : (
                                <div className="friends-content">
                                    <div className="friends-header">
                                        <h3>{t('friends.title')}</h3>
                                        <button 
                                            className="manage-friends-btn"
                                            onClick={() => setShowFriendsManager(true)}
                                        >
                                            {t('friends.manageFriends')}
                                        </button>
                                    </div>
                                    <div className="friends-summary">
                                        <div className="friends-stats">
                                            <div className="stat-item">
                                                <span className="stat-label">{t('friends.totalFriends')}</span>
                                                <span className="stat-value">0</span>
                                            </div>
                                            <div className="stat-item">
                                                <span className="stat-label">{t('friends.onlineFriends')}</span>
                                                <span className="stat-value">0</span>
                                            </div>
                                            <div className="stat-item">
                                                <span className="stat-label">{t('friends.pendingRequests')}</span>
                                                <span className="stat-value">0</span>
                                            </div>
                                        </div>
                                        <div className="friends-actions">
                                            <button 
                                                className="primary-btn"
                                                onClick={() => setShowFriendsManager(true)}
                                            >
                                                {t('friends.findFriends')}
                                            </button>
                                        </div>
                                    </div>
                                    <div className="recent-activity">
                                        <h4>{t('friends.recentActivity')}</h4>
                                        <div className="activity-list">
                                            <div className="empty-activity">
                                                <p>{t('friends.noRecentActivity')}</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {error && <div className="error-message">{error}</div>}
                {success && <div className="success-message">{success}</div>}

                <div className="profile-actions">
                    <button className="cancel-btn" onClick={onClose}>
                        {t('profile.cancel')}
                    </button>
                    <button
                        className="save-btn"
                        onClick={handleSave}
                        disabled={isLoading}
                    >
                        {isLoading ? t('profile.saving') : t('profile.save')}
                    </button>
                </div>

                {showFriendsManager && (
                    <FriendsManager
                        currentUserId={currentUser.id}
                        onClose={() => setShowFriendsManager(false)}
                    />
                )}
            </div>
        </div>
    );
};