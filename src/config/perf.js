// 性能相關常數集中管理
export const VIRTUALIZATION_THRESHOLD = 100; // 超過此數量時啟用虛擬化

// React-window 虛擬化配置
export const CARD_WIDTH = 120;   // px, 卡片寬度
export const CARD_HEIGHT = 120;  // px, 卡片高度
export const GRID_GAP = 12;      // px, 卡片間距 (緊湊間距)
export const ITEM_WIDTH = CARD_WIDTH + GRID_GAP;   // 132px
export const ITEM_HEIGHT = CARD_HEIGHT + GRID_GAP; // 132px

// 框選動畫配置
export const FLIP_DURATION = 180; // ms, 框選淡出動畫時長
