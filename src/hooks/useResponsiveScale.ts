import { useState, useEffect, useCallback, RefObject } from 'react';
import useViewportSize from './useViewportSize';

interface ResponsiveScaleOptions {
  baseWidth?: number;
  baseHeight?: number;
  maxScale?: number;
  minScale?: number;
  maintainAspectRatio?: boolean;
  reservedHeight?: number; // Height to reserve for headers/footers
}

interface ResponsiveScaleReturn {
  scale: number;
  scaledWidth: number;
  scaledHeight: number;
  containerStyle: React.CSSProperties;
}

/**
 * Hook to calculate responsive scaling for game boards and components
 * Automatically scales content to fit viewport while maintaining aspect ratio
 * 
 * @param options - Configuration options for scaling behavior
 * @returns Scale factor and container styles
 */
const useResponsiveScale = (
  options: ResponsiveScaleOptions = {}
): ResponsiveScaleReturn => {
  const {
    baseWidth = 800,
    baseHeight = 600,
    maxScale = 1,
    minScale = 0.3,
    maintainAspectRatio = true,
    reservedHeight = 120, // Default space for header/footer
  } = options;

  const { width: viewportWidth, height: viewportHeight } = useViewportSize();
  const [scale, setScale] = useState<number>(1);

  const calculateScale = useCallback(() => {
    if (viewportWidth === 0 || viewportHeight === 0) {
      return 1;
    }

    const availableWidth = viewportWidth;
    const availableHeight = viewportHeight - reservedHeight;

    let scaleX = availableWidth / baseWidth;
    let scaleY = availableHeight / baseHeight;

    let calculatedScale: number;

    if (maintainAspectRatio) {
      // Use the smaller scale to ensure content fits in both dimensions
      calculatedScale = Math.min(scaleX, scaleY);
    } else {
      // Use average scale if not maintaining aspect ratio
      calculatedScale = (scaleX + scaleY) / 2;
    }

    // Clamp scale between min and max
    calculatedScale = Math.max(minScale, Math.min(maxScale, calculatedScale));

    return calculatedScale;
  }, [
    viewportWidth,
    viewportHeight,
    baseWidth,
    baseHeight,
    maxScale,
    minScale,
    maintainAspectRatio,
    reservedHeight,
  ]);

  useEffect(() => {
    const newScale = calculateScale();
    setScale(newScale);
  }, [calculateScale]);

  const scaledWidth = baseWidth * scale;
  const scaledHeight = baseHeight * scale;

  const containerStyle: React.CSSProperties = {
    transform: `scale(${scale})`,
    transformOrigin: 'top center',
    width: `${baseWidth}px`,
    height: `${baseHeight}px`,
    transition: 'transform 0.3s ease',
  };

  return {
    scale,
    scaledWidth,
    scaledHeight,
    containerStyle,
  };
};

/**
 * Hook to calculate scale for a specific element reference
 * Useful when you need to scale based on actual element dimensions
 */
export const useElementScale = (
  elementRef: RefObject<HTMLElement>,
  options: ResponsiveScaleOptions = {}
): ResponsiveScaleReturn => {
  const { width: viewportWidth, height: viewportHeight } = useViewportSize();
  const [scale, setScale] = useState<number>(1);
  const [baseSize, setBaseSize] = useState({ width: 0, height: 0 });

  const {
    maxScale = 1,
    minScale = 0.3,
    maintainAspectRatio = true,
    reservedHeight = 120,
  } = options;

  useEffect(() => {
    if (elementRef.current) {
      const rect = elementRef.current.getBoundingClientRect();
      setBaseSize({
        width: rect.width,
        height: rect.height,
      });
    }
  }, [elementRef]);

  useEffect(() => {
    if (baseSize.width === 0 || baseSize.height === 0) {
      return;
    }

    const availableWidth = viewportWidth;
    const availableHeight = viewportHeight - reservedHeight;

    let scaleX = availableWidth / baseSize.width;
    let scaleY = availableHeight / baseSize.height;

    let calculatedScale: number;

    if (maintainAspectRatio) {
      calculatedScale = Math.min(scaleX, scaleY);
    } else {
      calculatedScale = (scaleX + scaleY) / 2;
    }

    calculatedScale = Math.max(minScale, Math.min(maxScale, calculatedScale));
    setScale(calculatedScale);
  }, [
    viewportWidth,
    viewportHeight,
    baseSize,
    maxScale,
    minScale,
    maintainAspectRatio,
    reservedHeight,
  ]);

  const containerStyle: React.CSSProperties = {
    transform: `scale(${scale})`,
    transformOrigin: 'top center',
    transition: 'transform 0.3s ease',
  };

  return {
    scale,
    scaledWidth: baseSize.width * scale,
    scaledHeight: baseSize.height * scale,
    containerStyle,
  };
};

export default useResponsiveScale;
