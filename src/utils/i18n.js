/**
 * i18n 工具函數
 * 提供一些輔助功能，如語言檢測、格式化等
 */

import { SUPPORTED_LANGUAGES } from '../contexts/I18nContext';

/**
 * 檢測瀏覽器語言並返回支援的語言代碼
 * @returns {string} 支援的語言代碼
 */
export const detectBrowserLanguage = () => {
  const browserLang = navigator.language || navigator.userLanguage;

  // 直接匹配
  if (SUPPORTED_LANGUAGES[browserLang]) {
    return browserLang;
  }

  // 匹配語言前綴
  const langPrefix = browserLang.split('-')[0];
  const matchedLang = Object.keys(SUPPORTED_LANGUAGES).find((lang) => lang.startsWith(langPrefix));

  if (matchedLang) {
    return matchedLang;
  }

  // 特殊處理中文
  if (langPrefix === 'zh') {
    const lower = (browserLang || '').toLowerCase();
    // 簡體（中國大陸/新加坡/馬來西亞 或含 Hans）→ zh-CN；
    // 其餘中文（臺灣/香港/澳門 或含 Hant）→ zh-TW；
    if (
      lower.includes('cn') ||
      lower.includes('hans') ||
      lower.includes('sg') ||
      lower.includes('my')
    ) {
      return 'zh-CN';
    }
    return 'zh-TW';
  }

  // 預設返回繁體中文
  return 'zh-TW';
};

/**
 * 格式化帶參數的翻譯文字
 * @param {string} template - 模板字串，使用 {{key}} 格式
 * @param {object} params - 參數對象
 * @returns {string} 格式化後的字串
 */
export const formatTranslation = (template, params = {}) => {
  if (!template || typeof template !== 'string') {
    return template || '';
  }

  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return params[key] !== undefined ? params[key] : match;
  });
};

/**
 * 獲取語言的本地化名稱
 * @param {string} langCode - 語言代碼
 * @returns {string} 語言的本地化名稱
 */
export const getLanguageNativeName = (langCode) => {
  const nativeNames = {
    'zh-TW': '繁體中文',
    'zh-CN': '简体中文',
    'en-US': 'English',
  };

  return nativeNames[langCode] || langCode;
};

/**
 * 檢查是否為 RTL（從右到左）語言
 * @param {string} langCode - 語言代碼
 * @returns {boolean} 是否為 RTL 語言
 */
export const isRTLLanguage = (langCode) => {
  const rtlLanguages = ['ar', 'he', 'fa', 'ur'];
  return rtlLanguages.some((rtl) => langCode.startsWith(rtl));
};

/**
 * 驗證翻譯鍵的格式
 * @param {string} key - 翻譯鍵
 * @returns {boolean} 是否為有效格式
 */
export const isValidTranslationKey = (key) => {
  if (!key || typeof key !== 'string') {
    return false;
  }

  // 檢查是否符合 a.b.c 的格式
  return /^[a-zA-Z][a-zA-Z0-9]*(\.[a-zA-Z][a-zA-Z0-9]*)*$/.test(key);
};

export default {
  detectBrowserLanguage,
  formatTranslation,
  getLanguageNativeName,
  isRTLLanguage,
  isValidTranslationKey,
};
