// Server utility functions

const crypto = require('crypto');

// Generate secure token function
const generateSecureToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

// Generate unique ID
const generateId = () => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
};

// Username validation function
const validateUsername = async (username) => {
  try {
    // Basic validation
    if (!username || typeof username !== 'string') {
      return { valid: false, error: 'Kullanıcı adı gerekli' };
    }

    const trimmedUsername = username.trim();
    
    if (trimmedUsername.length < 3) {
      return { valid: false, error: 'Kullanıcı adı en az 3 karakter olmalı' };
    }
    
    if (trimmedUsername.length > 20) {
      return { valid: false, error: 'Kullanıcı adı en fazla 20 karakter olabilir' };
    }
    
    if (!/^[a-zA-Z0-9_-]+$/.test(trimmedUsername)) {
      return { valid: false, error: 'Kullanıcı adı sadece harf, rakam, _ ve - içerebilir' };
    }
    
    if (/^\d/.test(trimmedUsername)) {
      return { valid: false, error: 'Kullanıcı adı rakamla başlayamaz' };
    }

    // Check if username already exists
    const { getDatabaseManager } = require('../../database/DatabaseManagerWrapper');
    const dbManager = getDatabaseManager();
    const userRepo = dbManager.getUserRepository();
    const existingUser = await userRepo.findByUsername(trimmedUsername);
    
    if (existingUser) {
      // Generate suggestions
      const suggestions = [];
      for (let i = 1; i <= 3; i++) {
        const suggestion = `${trimmedUsername}${i}`;
        const suggestionExists = await userRepo.findByUsername(suggestion);
        if (!suggestionExists) {
          suggestions.push(suggestion);
        }
      }
      
      return { 
        valid: false, 
        error: 'Bu kullanıcı adı zaten alınmış',
        suggestions: suggestions.slice(0, 3)
      };
    }

    return { valid: true };
  } catch (error) {
    console.error('Username validation error:', error);
    return { valid: false, error: 'Doğrulama sırasında hata oluştu' };
  }
};

module.exports = {
  generateSecureToken,
  generateId,
  validateUsername
};