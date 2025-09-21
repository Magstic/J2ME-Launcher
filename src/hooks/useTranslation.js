import { useI18n } from '../contexts/I18nContext';

/**
 * 簡化的翻譯 Hook
 * 提供更簡潔的 API 供組件使用
 */
export const useTranslation = () => {
  const { t, currentLanguage, changeLanguage, isLoading, supportedLanguages } = useI18n();

  return {
    t,
    language: currentLanguage,
    changeLanguage,
    isLoading,
    supportedLanguages,
  };
};

export default useTranslation;
