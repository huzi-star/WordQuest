import React, { createContext, useContext } from 'react';

export const THEMES = {
  green: {
    id: 'green',
    name: 'Pakistan Green',
    accent: '#22c55e',
    accent2: '#15803d',
    gold: '#fcd34d',
    danger: '#ef4444',
    bg: '#070b14',
    card: '#0e1726',
    border: '#1f2937',
  },
  gold: {
    id: 'gold',
    name: 'Royal Gold',
    accent: '#fcd34d',
    accent2: '#d97706',
    gold: '#22c55e',
    danger: '#ef4444',
    bg: '#0c0a06',
    card: '#1a1408',
    border: '#3f2c10',
  },
  purple: {
    id: 'purple',
    name: 'Cosmic Purple',
    accent: '#a78bfa',
    accent2: '#7c3aed',
    gold: '#fcd34d',
    danger: '#ef4444',
    bg: '#0c0716',
    card: '#1a132e',
    border: '#2e1f55',
  },
  neon: {
    id: 'neon',
    name: 'Neon Cyan',
    accent: '#22d3ee',
    accent2: '#0e7490',
    gold: '#fbbf24',
    danger: '#f43f5e',
    bg: '#06121a',
    card: '#0b2030',
    border: '#1f3a4d',
  },
};

const ThemeContext = createContext(THEMES.green);

export function ThemeProvider({ themeId = 'green', children }) {
  const theme = THEMES[themeId] || THEMES.green;
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
