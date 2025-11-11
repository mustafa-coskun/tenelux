// Dark theme configuration for Tenelux game
export const theme = {
  colors: {
    primary: '#1a1a1a',
    secondary: '#2d2d2d',
    accent: '#ff4444',
    text: '#ffffff',
    textSecondary: '#cccccc',
    background: '#0d0d0d',
    surface: '#1f1f1f',
    border: '#333333',
    success: '#00ff00',
    warning: '#ffaa00',
    error: '#ff0000',
  },
  fonts: {
    primary: '"Courier New", monospace',
    secondary: '"Arial", sans-serif',
  },
  spacing: {
    xs: '4px',
    sm: '8px',
    md: '16px',
    lg: '24px',
    xl: '32px',
    xxl: '48px',
  },
  borderRadius: {
    sm: '4px',
    md: '8px',
    lg: '12px',
  },
  shadows: {
    sm: '0 2px 4px rgba(0, 0, 0, 0.5)',
    md: '0 4px 8px rgba(0, 0, 0, 0.6)',
    lg: '0 8px 16px rgba(0, 0, 0, 0.7)',
  },
} as const;

export type Theme = typeof theme;
