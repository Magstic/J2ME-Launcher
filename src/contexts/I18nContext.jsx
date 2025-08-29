import React, { createContext, useContext, useState, useEffect } from 'react';

// 支援的語言列表
export const SUPPORTED_LANGUAGES = {
  'zh-TW': '繁體中文',
  'zh-CN': '简体中文',
  'en-US': 'English',
};

// 預設語言
const DEFAULT_LANGUAGE = 'zh-TW';

// 創建 Context
const I18nContext = createContext();

// 動態載入翻譯文件
const loadTranslations = async (language) => {
  try {
    const translations = await import(`../locales/${language}.json`);
    return translations.default || translations;
  } catch (error) {
    console.warn(`Failed to load translations for ${language}, falling back to default`);
    if (language !== DEFAULT_LANGUAGE) {
      return loadTranslations(DEFAULT_LANGUAGE);
    }
    return {};
  }
};

// 從嵌套對象中獲取翻譯值
const getNestedValue = (obj, path) => {
  return path.split('.').reduce((current, key) => {
    return current && current[key] !== undefined ? current[key] : null;
  }, obj);
};

// I18n Provider 組件
export const I18nProvider = ({ children }) => {
  const [currentLanguage, setCurrentLanguage] = useState(() => {
    // 優先從 localStorage 讀取
    try {
      const saved = localStorage.getItem('language');
      if (saved && SUPPORTED_LANGUAGES[saved]) {
        return saved;
      }
    } catch (error) {
      console.warn('Failed to read language from localStorage');
    }
    
    // 其次檢測系統語言
    const systemLang = navigator.language || navigator.userLanguage;
    if (systemLang.startsWith('zh')) {
      return systemLang.includes('TW') || systemLang.includes('Hant') ? 'zh-TW' : 'zh-TW';
    } else if (systemLang.startsWith('ja')) {
      return 'ja-JP';
    } else if (systemLang.startsWith('en')) {
      return 'en-US';
    }
    
    return DEFAULT_LANGUAGE;
  });
  
  const [translations, setTranslations] = useState({});
  const [isLoading, setIsLoading] = useState(true);

  // 載入語言文件
  useEffect(() => {
    const loadLanguage = async () => {
      try {
        setIsLoading(true);
        
        // 在開發環境下使用 fetch 來避免模塊緩存
        if (process.env.NODE_ENV === 'development') {
          const timestamp = Date.now();
          const response = await fetch(`/src/locales/${currentLanguage}.json?t=${timestamp}`);
          if (response.ok) {
            const translations = await response.json();
            setTranslations(translations);
          } else {
            throw new Error(`Failed to fetch: ${response.status}`);
          }
        } else {
          // 生產環境使用正常的動態 import
          const translationModule = await import(`../locales/${currentLanguage}.json`);
          setTranslations(translationModule.default || translationModule);
        }
      } catch (error) {
        console.error(`Failed to load language ${currentLanguage}:`, error);
        
        // 如果載入失敗，嘗試載入預設語言
        if (currentLanguage !== DEFAULT_LANGUAGE) {
          try {
            if (process.env.NODE_ENV === 'development') {
              const timestamp = Date.now();
              const response = await fetch(`/src/locales/${DEFAULT_LANGUAGE}.json?t=${timestamp}`);
              if (response.ok) {
                const translations = await response.json();
                setTranslations(translations);
              } else {
                throw new Error(`Failed to fetch fallback: ${response.status}`);
              }
            } else {
              const fallbackModule = await import(`../locales/${DEFAULT_LANGUAGE}.json`);
              setTranslations(fallbackModule.default || fallbackModule);
            }
          } catch (fallbackError) {
            console.error(`Failed to load fallback language ${DEFAULT_LANGUAGE}:`, fallbackError);
            setTranslations({});
          }
        } else {
          setTranslations({});
        }
      } finally {
        setIsLoading(false);
      }
    };

    loadLanguage();
  }, [currentLanguage]);

  // 開發環境下的自動熱重載功能
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      let intervalId;
      let lastModified = {};
      
      // 檢查文件是否有更新
      const checkForUpdates = async () => {
        try {
          const response = await fetch(`/src/locales/${currentLanguage}.json`, {
            method: 'HEAD'
          });
          
          if (response.ok) {
            const lastModifiedHeader = response.headers.get('last-modified');
            const currentModified = new Date(lastModifiedHeader).getTime();
            
            if (lastModified[currentLanguage] && lastModified[currentLanguage] !== currentModified) {
              console.log('🔄 Translation file updated, reloading...');
              
              // 重新載入翻譯
              const timestamp = Date.now();
              const dataResponse = await fetch(`/src/locales/${currentLanguage}.json?t=${timestamp}`);
              if (dataResponse.ok) {
                const newTranslations = await dataResponse.json();
                setTranslations(newTranslations);
              }
            }
            
            lastModified[currentLanguage] = currentModified;
          }
        } catch (error) {
          // 靜默處理錯誤，避免控制台噪音
        }
      };
      
      // 每 1 秒檢查一次文件更新
      intervalId = setInterval(checkForUpdates, 1000);
      
      // 手動重載快捷鍵（備用）
      const handleKeyPress = (event) => {
        if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'R') {
          event.preventDefault();
          console.log('🔄 Manually reloading translations...');
          checkForUpdates();
        }
      };

      window.addEventListener('keydown', handleKeyPress);
      
      return () => {
        if (intervalId) clearInterval(intervalId);
        window.removeEventListener('keydown', handleKeyPress);
      };
    }
  }, [currentLanguage]);

  // 切換語言
  const changeLanguage = async (language) => {
    if (!SUPPORTED_LANGUAGES[language]) {
      console.warn(`Unsupported language: ${language}`);
      return;
    }

    setCurrentLanguage(language);
    
    // 持久化到 localStorage
    try {
      localStorage.setItem('language', language);
    } catch (error) {
      console.warn('Failed to save language to localStorage');
    }
  };

  // 翻譯函數
  const t = (key, params = {}) => {
    if (!key) return '';
    
    // 獲取翻譯值
    let translation = getNestedValue(translations, key);
    
    // 如果找不到翻譯，返回 key 作為 fallback
    if (translation === null || translation === undefined) {
      // 在載入期間可能會出現暫時性的缺失，避免噪音
      if (!isLoading) {
        console.warn(`Translation missing for key: ${key}`);
      }
      return key;
    }
    
    // 確保返回字串，避免 React 渲染錯誤
    if (typeof translation === 'object') {
      console.warn(`Translation for key "${key}" is an object, expected string:`, translation);
      return key;
    }
    
    // 處理參數替換
    if (typeof translation === 'string' && Object.keys(params).length > 0) {
      return translation.replace(/\{\{(\w+)\}\}/g, (match, paramKey) => {
        return params[paramKey] !== undefined ? params[paramKey] : match;
      });
    }
    
    return String(translation);
  };

  const contextValue = {
    currentLanguage,
    changeLanguage,
    t,
    isLoading,
    supportedLanguages: SUPPORTED_LANGUAGES
  };

  return (
    <I18nContext.Provider value={contextValue}>
      {children}
    </I18nContext.Provider>
  );
};

// 自定義 Hook
export const useI18n = () => {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
};

export default I18nContext;
