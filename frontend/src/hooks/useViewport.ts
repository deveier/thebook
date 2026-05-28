import { useState, useEffect } from 'react';

type ViewportSize = 'mobile' | 'tablet' | 'desktop';

interface ViewportInfo {
  size: ViewportSize;
  width: number;
  height: number;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
}

export function useViewport(): ViewportInfo {
  const [info, setInfo] = useState<ViewportInfo>(() => {
    const w = typeof window !== 'undefined' ? window.innerWidth : 1024;
    const h = typeof window !== 'undefined' ? window.innerHeight : 768;
    return {
      size: w < 768 ? 'mobile' : w < 1024 ? 'tablet' : 'desktop',
      width: w,
      height: h,
      isMobile: w < 768,
      isTablet: w >= 768 && w < 1024,
      isDesktop: w >= 1024,
    };
  });

  useEffect(() => {
    let ticking = false;
    const handleResize = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          const w = window.innerWidth;
          const h = window.innerHeight;
          setInfo({
            size: w < 768 ? 'mobile' : w < 1024 ? 'tablet' : 'desktop',
            width: w,
            height: h,
            isMobile: w < 768,
            isTablet: w >= 768 && w < 1024,
            isDesktop: w >= 1024,
          });
          ticking = false;
        });
        ticking = true;
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return info;
}
