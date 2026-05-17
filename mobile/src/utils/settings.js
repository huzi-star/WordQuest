import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { setApiLanguage } from './api';

const KEY = 'wordquest:settings:v1';

export const DEFAULTS = {
  sound: true,
  vibration: true,
  language: 'english',       // default = English. 'urdu' (Roman) also available.
  theme: 'green',            // 'green' | 'gold' | 'purple' | 'neon'
  hasSeenOnboarding: false,
};

// UI chrome only — game content (puzzle words, agent messages) comes from
// Gemini in the requested language. These translations cover navigation,
// button labels, screen headers, and short UI affordances.
const STRINGS = {
  // Common
  back:                { urdu: 'Wapas', english: 'Back' },
  ok:                  { urdu: 'OK', english: 'OK' },
  cancel:              { urdu: 'Cancel', english: 'Cancel' },
  retry:               { urdu: 'Dobara try karo', english: 'Try again' },
  loading:             { urdu: 'Load ho raha...', english: 'Loading...' },
  done:                { urdu: 'Done', english: 'Done' },

  // Home
  brand_tag:           { urdu: 'AI POWERED · WORLD THEMED', english: 'AI POWERED · WORLD THEMED' },
  high_score:          { urdu: 'HIGH SCORE', english: 'HIGH SCORE' },
  best_streak:         { urdu: 'BEST STREAK', english: 'BEST STREAK' },
  rounds:              { urdu: 'Rounds', english: 'Rounds' },
  perfect:             { urdu: 'Perfect', english: 'Perfect' },
  agents:              { urdu: 'Agents', english: 'Agents' },
  play_game:           { urdu: 'PLAY ADAPTIVE', english: 'PLAY ADAPTIVE' },
  levels_title:        { urdu: 'LEVELS', english: 'LEVELS' },
  levels_sub:          { urdu: '15 levels — har level AI design karta hai', english: '15 levels — each one designed by the AI' },
  my_stats:            { urdu: 'My Stats Dashboard', english: 'Stats Dashboard' },
  daily_challenge:     { urdu: 'Daily Challenge', english: 'Daily Challenge' },
  quiz_mode:           { urdu: 'Quiz Mode', english: 'Quiz Mode' },
  settings_btn:        { urdu: 'Settings', english: 'Settings' },
  level_locked:        { urdu: 'Locked', english: 'Locked' },
  level_label:         { urdu: 'Level', english: 'Level' },

  // Category screen
  ai_thinking:         { urdu: 'AI agents kaam kar rahe', english: 'AI agents at work' },
  ai_chose:            { urdu: 'AI ne choose kiya', english: 'AI picked' },
  ready_btn:           { urdu: 'TAYAAR HUN! →', english: "I'M READY! →" },
  ai_thoughts:         { urdu: 'AI ka sochna', english: "AI's reasoning" },
  fun_fact:            { urdu: 'Fun Fact', english: 'Fun fact' },
  time_label:          { urdu: 'TIME', english: 'TIME' },
  words_label:         { urdu: 'WORDS', english: 'WORDS' },
  grid_label:          { urdu: 'GRID', english: 'GRID' },

  // Game screen
  hint_btn:            { urdu: 'Hint', english: 'Hint' },
  clear_btn:           { urdu: 'Clear', english: 'Clear' },
  quit_btn:            { urdu: 'Quit', english: 'Quit' },
  selection_label:     { urdu: 'Selection:', english: 'Selection:' },
  round_label:         { urdu: 'Round', english: 'Round' },
  hints_done_msg:      { urdu: 'Hints khatam — agle round mein milenge', english: 'Hints used up — refresh next round' },
  word_in_list_msg:    { urdu: 'Yeh list mein nahi', english: 'Not in the word list' },
  already_found_msg:   { urdu: 'Yeh pehle mil gaya tha!', english: 'Already found that one!' },
  line_break_msg:      { urdu: 'Line break — naya selection shuru', english: 'Line broke — starting fresh' },

  // Round complete
  perfect_round:       { urdu: 'PERFECT ROUND!', english: 'PERFECT ROUND!' },
  nice_work:           { urdu: 'NICE WORK!', english: 'NICE WORK!' },
  keep_going:          { urdu: 'KEEP GOING!', english: 'KEEP GOING!' },
  points_earned:       { urdu: 'points earned', english: 'points earned' },
  next_round:          { urdu: 'NEXT ROUND', english: 'NEXT ROUND' },
  home:                { urdu: 'Home', english: 'Home' },
  stats:               { urdu: 'Stats', english: 'Stats' },
  ai_agent:            { urdu: 'AI AGENT', english: 'AI AGENT' },
  badges_earned:       { urdu: 'BADGES EARNED', english: 'BADGES EARNED' },
  next_pred:           { urdu: 'AI AGENT · Next Round', english: 'AI AGENT · Next Round' },
  ai_analysis:         { urdu: 'AI agent analysis...', english: 'AI agent analysis...' },

  // Game over
  game_over:           { urdu: 'Game Over!', english: 'Game Over!' },
  final_score:         { urdu: 'Final Score', english: 'Final Score' },
  rounds_played:       { urdu: 'Rounds', english: 'Rounds' },
  ai_coach:            { urdu: 'AI Coach Analysis', english: 'AI Coach Analysis' },
  strengths:           { urdu: 'Tumhari Strengths', english: 'Your strengths' },
  improvements:        { urdu: 'Improve karo', english: 'Areas to improve' },
  practice:            { urdu: 'Practice ye words', english: 'Practice these words' },
  play_again:          { urdu: 'Dobara Khelo', english: 'Play again' },

  // Settings
  settings_title:      { urdu: 'Settings', english: 'Settings' },
  settings_sub:        { urdu: 'App ki har cheez control karo', english: 'Control every part of the app' },
  feedback_section:    { urdu: 'FEEDBACK', english: 'FEEDBACK' },
  language_section:    { urdu: 'LANGUAGE', english: 'LANGUAGE' },
  theme_section:       { urdu: 'THEME', english: 'THEME' },
  data_section:        { urdu: 'DATA', english: 'DATA' },
  about_section:       { urdu: 'ABOUT', english: 'ABOUT' },
  sound_setting:       { urdu: 'Sound effects', english: 'Sound effects' },
  sound_setting_sub:   { urdu: 'Ding sound when word found', english: 'Ding sound when a word is found' },
  vibration_setting:   { urdu: 'Vibration', english: 'Vibration' },
  vibration_setting_sub:{ urdu: 'Haptic feedback', english: 'Haptic feedback' },
  language_setting:    { urdu: 'Language', english: 'Language' },
  language_setting_sub:{ urdu: 'Roman Urdu + English mix', english: 'Roman Urdu / English' },
  theme_setting:       { urdu: 'Color theme', english: 'Colour theme' },
  theme_setting_sub:   { urdu: 'App ka accent color', english: 'App accent colour' },
  reset_stats:         { urdu: 'Reset all stats', english: 'Reset all stats' },
  reset_stats_sub:     { urdu: 'Saari progress zero ho jayegi', english: 'All progress will be cleared' },
  reset_confirm_title: { urdu: 'Reset all stats?', english: 'Reset all stats?' },
  reset_confirm_msg:   { urdu: 'Saare scores, badges, streak, mastery zero. Undo nahi ho sakta.', english: 'Scores, badges, streak and mastery will be cleared. Cannot be undone.' },

  // Daily challenge
  daily_title:         { urdu: 'Daily Challenge', english: 'Daily Challenge' },
  daily_card_title:    { urdu: 'TODAY\'S PUZZLE', english: "TODAY'S PUZZLE" },
  daily_note:          { urdu: 'Same puzzle har user ke liye aaj.', english: 'Same puzzle for every player today.' },
  daily_tip:           { urdu: 'Sirf ek baar khel sakte ho aaj, kal naya puzzle.', english: 'Only one attempt today — a new puzzle drops tomorrow.' },
  start_challenge:     { urdu: 'START CHALLENGE', english: 'START CHALLENGE' },

  // Quiz
  quiz_title:          { urdu: 'Quiz Mode', english: 'Quiz Mode' },
  quiz_question:       { urdu: 'Question', english: 'Question' },
  quiz_correct:        { urdu: 'Sahi jawab!', english: 'Correct!' },
  quiz_wrong:          { urdu: 'Galat jawab', english: 'Wrong answer' },
  quiz_next:           { urdu: 'Next →', english: 'Next →' },
  quiz_results:        { urdu: 'Quiz Result', english: 'Quiz Result' },
  quiz_score:          { urdu: 'Score', english: 'Score' },
  quiz_finish:         { urdu: 'Finish', english: 'Finish' },

  // Onboarding
  onboard_skip:        { urdu: 'Skip', english: 'Skip' },
  onboard_next:        { urdu: 'Next', english: 'Next' },
  onboard_start:       { urdu: 'START', english: 'START' },
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
  try { await AsyncStorage.setItem(KEY, JSON.stringify(settings)); } catch {}
}

const SettingsContext = createContext({ settings: DEFAULTS, setSetting: () => {}, t: (k) => k, ready: false });

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULTS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const s = await loadSettings();
      setSettings(s);
      setApiLanguage(s.language);
      setReady(true);
    })();
  }, []);

  const setSetting = (key, value) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      persist(next);
      if (key === 'language') setApiLanguage(value);
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
