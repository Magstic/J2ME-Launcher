import { useState, useEffect, useCallback } from 'react';

/**
 * 歡迎指南邏輯
 * 管理首次啟動檢測和歡迎指南狀態
 */
export const useWelcomeGuide = () => {
  const [isWelcomeGuideOpen, setIsWelcomeGuideOpen] = useState(false);

  // 首次啟動檢測和歡迎指南
  useEffect(() => {
    const checkFirstLaunch = async () => {
      try {
        const hasSeenWelcome = localStorage.getItem('hasSeenWelcomeGuide');
        if (!hasSeenWelcome) {
          // 延遲顯示歡迎指南，確保應用完全載入
          setTimeout(() => {
            setIsWelcomeGuideOpen(true);
          }, 1000);
        }
      } catch (error) {
        console.warn('Failed to check first launch status:', error);
      }
    };

    checkFirstLaunch();
  }, []);

  const handleWelcomeGuideComplete = useCallback(() => {
    try {
      localStorage.setItem('hasSeenWelcomeGuide', 'true');
    } catch (error) {
      console.warn('Failed to save welcome guide completion:', error);
    }
  }, []);

  const openWelcomeGuide = useCallback(() => setIsWelcomeGuideOpen(true), []);
  const closeWelcomeGuide = useCallback(() => setIsWelcomeGuideOpen(false), []);

  return {
    isWelcomeGuideOpen,
    openWelcomeGuide,
    closeWelcomeGuide,
    handleWelcomeGuideComplete
  };
};
