import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useState } from 'react';

const KEY = 'wordquest:settings:v1';

export const DEFAULTS = {
  sound: true,
  vibration: true,
  language: 'urdu', // 'urdu' (Roman Urdu/English mix) or 'english'
  hasSeenOnboarding: false,
};

const SettingsContext = createContext({
  settings: DEFAULTS,
  setSetting: () => {},
  t: (k) => k,
  ready: false,
});

const STRINGS = {
  // Home
  brand_tag:           { urdu: 'AI POWERED · PAKISTAN THEMED', english: 'AI POWERED · PAKISTAN THEMED' },
  high_score:          { urdu: 'HIGH SCORE', english: 'HIGH SCORE' },
  best_streak:         { urdu: 'BEST STREAK', english: 'BEST STREAK' },
  rounds:              { urdu: 'Rounds', english: 'Rounds' },
  perfect:             { urdu: 'Perfect', english: 'Perfect' },
  agents:              { urdu: 'Agents', english: 'Agents' },
  play_game:           { urdu: 'PLAY GAME', english: 'PLAY GAME' },
  my_stats:            { urdu: 'My Stats Dashboard', english: 'My Stats Dashboard' },
  daily_challenge:     { urdu: '🌟 Daily Challenge', english: '🌟 Daily Challenge' },
  settings:            { urdu: 'Settings', english: 'Settings' },

  // Category screen
  ai_thinking:         { urdu: 'AI agents at work', english: 'AI agents at work' },
  ai_chose:            { urdu: '🤖 AI ne choose kiya', english: '🤖 AI picked' },
  ready_btn:           { urdu: 'TAYAAR HUN! →', english: "I'M READY! →" },
  ai_thoughts:         { urdu: 'AI ka sochna', english: "AI's Reasoning" },
  fun_fact:            { urdu: 'Fun Fact', english: 'Fun Fact' },
  time_label:          { urdu: 'TIME', english: 'TIME' },
  words_label:         { urdu: 'WORDS', english: 'WORDS' },
  grid_label:          { urdu: 'GRID', english: 'GRID' },

  // Game screen
  hint_btn:            { urdu: 'Hint', english: 'Hint' },
  clear_btn:           { urdu: 'Clear', english: 'Clear' },
  quit_btn:            { urdu: 'Quit', english: 'Quit' },
  selection_label:     { urdu: 'Selection:', english: 'Selection:' },
  round_label:         { urdu: 'Round', english: 'Round' },

  // Round complete
  perfect_round:       { urdu: 'PERFECT ROUND!', english: 'PERFECT ROUND!' },
  nice_work:           { urdu: 'NICE WORK!', english: 'NICE WORK!' },
  keep_going:          { urdu: 'KEEP GOING!', english: 'KEEP GOING!' },
  next_round:          { urdu: 'NEXT ROUND', english: 'NEXT ROUND' },
  home:                { urdu: 'Home', english: 'Home' },
  stats:               { urdu: 'Stats', english: 'Stats' },

  // Settings
  sound_setting:       { urdu: 'Sound effects', english: 'Sound effects' },
  vibration_setting:   { urdu: 'Vibration', english: 'Vibration' },
  language_setting:    { urdu: 'Language', english: 'Language' },
  lang_urdu:           { urdu: 'Roman Urdu', english: 'Roman Urdu' },
  lang_english:        { urdu: 'English', english: 'English' },
  reset_stats:         { urdu: 'Reset all stats', english: 'Reset all stats' },
};

async function loadSettings() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

async function persist(settings) {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(settings));
  } catch {}
}

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULTS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const s = await loadSettings();
      setSettings(s);
      setReady(true);
    })();
  }, []);

  const setSetting = (key, value) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      persist(next);
      return next;
    });
  };

  const t = (key) => {
    const entry = STRINGS[key];
    if (!entry) return key;
    return entry[settings.language] || entry.urdu || key;
  };

  return (
    <SettingsContext.Provider value={{ settings, setSetting, t, ready }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}
