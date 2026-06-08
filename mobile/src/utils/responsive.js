// responsive.js — tiny helpers so screens scale across phone sizes.
//
// Design baseline: iPhone 11 (375pt wide, 812pt tall). All `rs()` / `rfs()`
// calls return values scaled relative to the actual device.
//
// Use these instead of hard-coded pixel sizes for fonts, paddings, button
// heights, and grid cells that need to feel similar on a 320pt iPhone SE
// and a 430pt iPhone Pro Max.

import { Dimensions, PixelRatio, Platform } from 'react-native';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const BASE_W = 375;
const BASE_H = 812;

// Lower clamp = 0.85 so things never shrink below readable size on tiny
// phones. Upper clamp = 1.20 so tablets don't blow text up to billboards.
function clamp(v, min = 0.85, max = 1.2) {
  return Math.max(min, Math.min(max, v));
}

const widthRatio  = clamp(SCREEN_W / BASE_W);
const heightRatio = clamp(SCREEN_H / BASE_H);

// Scale a width-anchored size (paddings, button widths, icon sizes).
export function rs(size) {
  return Math.round(size * widthRatio);
}

// Scale a height-anchored size (vertical paddings, hero blocks).
export function rsv(size) {
  return Math.round(size * heightRatio);
}

// Responsive font size — applies width ratio + pixel-density rounding so
// the font lands on a whole pixel and never looks blurry.
export function rfs(size) {
  const next = size * widthRatio;
  if (Platform.OS === 'ios') return Math.round(PixelRatio.roundToNearestPixel(next));
  return Math.round(PixelRatio.roundToNearestPixel(next)) - 1;
}

// Width percentage (e.g. wp(80) = 80% of screen width).
export function wp(percent) {
  return Math.round((SCREEN_W * percent) / 100);
}

// Height percentage.
export function hp(percent) {
  return Math.round((SCREEN_H * percent) / 100);
}

// Device size buckets — handy for picking layouts.
export const IS_SMALL = SCREEN_W < 360;       // SE, mini
export const IS_LARGE = SCREEN_W >= 414;      // Plus, Pro Max
export const IS_TABLET = SCREEN_W >= 600;
export const SCREEN_WIDTH  = SCREEN_W;
export const SCREEN_HEIGHT = SCREEN_H;
