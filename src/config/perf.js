// Performance-related constants centralized here
export const MAX_ANIMATIONS = 200; // upper bound for FLIP-permitted cards
export const VIRTUALIZATION_THRESHOLD = 100; // switch to virtualization over this total count
export const FLIP_DURATION = 180; // ms, consistent with existing transitions
export const FLIP_EASING = 'ease-out';

// React-window virtualization configuration
export const CARD_WIDTH = 120;   // px, card width
export const CARD_HEIGHT = 120;  // px, card height (120x120 square)
export const GRID_GAP = 12;      // px, gap between cards (compact spacing)
export const ITEM_WIDTH = CARD_WIDTH + GRID_GAP;   // 140px
export const ITEM_HEIGHT = CARD_HEIGHT + GRID_GAP; // 129px
