// Performance-related constants centralized here
export const MAX_ANIMATIONS = 200; // upper bound for FLIP-permitted cards
export const VISIBLE_BUFFER = 50;  // extra items before/after visible range
export const VIRTUALIZATION_THRESHOLD = 300; // switch to virtualization over this total count
export const FLIP_DURATION = 180; // ms, consistent with existing transitions
export const FLIP_EASING = 'ease-out';
// Approximate card layout metrics (used by virtualization/windowing)
// Includes item size + gap; adjust if card styles change significantly.
export const CARD_ROW_HEIGHT = 160; // px, approximate card height including vertical gap
export const CARD_COL_WIDTH = 160;  // px, approximate card width including horizontal gap
export const VISIBLE_ROW_BUFFER = 2; // extra rows before/after the visible window
