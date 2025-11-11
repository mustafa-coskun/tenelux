import React, { useEffect } from 'react';
import { useViewportSize } from '../hooks';
import './ResponsiveModal.css';

interface ResponsiveModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: 'small' | 'medium' | 'large';
  mobileFullScreen?: boolean;
  showCloseButton?: boolean;
  className?: string;
}

/**
 * Responsive modal component that adapts to different screen sizes
 * - Mobile: Full-screen or bottom sheet
 * - Tablet: Centered modal with appropriate sizing
 * - Desktop: Centered modal with max-width
 */
const ResponsiveModal: React.FC<ResponsiveModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  size = 'medium',
  mobileFullScreen = true,
  showCloseButton = true,
  className = '',
}) => {
  const { isMobile, isTablet } = useViewportSize();

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const modalClasses = [
    'responsive-modal',
    `modal-${size}`,
    isMobile && mobileFullScreen ? 'mobile-fullscreen' : '',
    isMobile && !mobileFullScreen ? 'mobile-bottom-sheet' : '',
    isTablet ? 'tablet-modal' : '',
    !isMobile && !isTablet ? 'desktop-modal' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="responsive-modal-overlay" onClick={onClose}>
      <div
        className={modalClasses}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'modal-title' : undefined}
      >
        {/* Modal Header */}
        {(title || showCloseButton) && (
          <div className="modal-header">
            {title && (
              <h2 id="modal-title" className="modal-title">
                {title}
              </h2>
            )}
            {showCloseButton && (
              <button
                className="modal-close-btn"
                onClick={onClose}
                aria-label="Close modal"
              >
                ✕
              </button>
            )}
          </div>
        )}

        {/* Modal Content */}
        <div className="modal-content">{children}</div>
      </div>
    </div>
  );
};

export default ResponsiveModal;
