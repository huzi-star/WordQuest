import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Animated, ImageBackground,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const BG = require('../../home_design/home_bg.jpeg');
import { roundComplete, coachFeedback } from '../utils/api';
import { saveStats, logRound, completeLevel, markDailyAttempt, recordLevelScore, loadStats } from '../utils/storage';
import { tierUpDelta } from '../utils/tiers';
import { trace } from '../utils/trace';
import { useSettings } from '../utils/settings';
import { useAuth } from '../utils/auth';
import Confetti from '../components/Confetti';
import { useTheme } from '../utils/theme';

export default function RoundCompleteScreen({ navigation, route }) {
  const { t } = useSettings();
  const { syncUp, user } = useAuth();
  const theme = useTheme();
  const { playerStats, sessionStats, roundResult, level } = route.params;
  const [loading, setLoading] = useState(true);
  const [reward, setReward] = useState(null);
  // Long-term-memory coach feedback. Populated after the round-end POST
  // (win = motivational line; loss = full diagnosis + next 3 rounds).
  const [coach, setCoach] = useState(null);
  const [showConfetti, setShowConfetti] = useState(true);
  // Tier-up payload, set after logRound finishes computing the new
  // totalScoreEver — checked when the player taps Continue.
  const [pendingTierUp, setPendingTierUp] = useState(null);
  // Tier-down payload — set when Quick Play fail penalty drops the
  // player below their current tier minimum. Takes priority over tier-up
  // (they're mutually exclusive but defensive ordering anyway).
  const [pendingTierDown, setPendingTierDown] = useState(null);
  // Penalty info for Quick Play fail — surfaced on the fail screen.
  const [penaltyInfo, setPenaltyInfo] = useState(null);

  // Wraps a destination so a pending tier-down/tier-up celebration is
  // shown FIRST. Tier-down wins if both somehow exist.
  function navigateWithTierUpCheck(destRoute, destParams) {
    if (pendingTierDown) {
      navigation.replace('TierDown', {
        ...pendingTierDown,
        returnTo: destRoute,
        returnParams: destParams,
      });
    } else if (pendingTierUp) {
      navigation.replace('TierUp', {
        ...pendingTierUp,
        returnTo: destRoute,
        returnParams: destParams,
      });
    } else {
      navigation.replace(destRoute, destParams);
    }
  }

  const fadeIn = useRef(new Animated.Value(0)).current;
  const heroScale = useRef(new Animated.Value(0.7)).current;
  const scoreFlash = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeIn, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.spring(heroScale, { toValue: 1, useNativeDriver: true, friction: 4 }),
      Animated.sequence([
        Animated.timing(scoreFlash, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.delay(200),
        Animated.timing(scoreFlash, { toValue: 0, duration: 600, useNativeDriver: true }),
      ]),
    ]).start();

    (async () => {
      const res = await roundComplete({
        userId: user?.id || null,
        wordsFound: roundResult.wordsFound,
        totalWords: roundResult.totalWords,
        timeLeft: roundResult.timeLeft,
        score: roundResult.roundScore,
        roundNumber: roundResult.roundNumber,
        streak: roundResult.streak,
      });
      if (res?.ok) {
        setReward(res.result);
        const allBadges = [...(sessionStats.badges || []), ...(res.result.badges || [])];
        sessionStats.badges = allBadges;
      }
      // Daily challenge with incomplete attempt → don't credit any score.
      const isDailyFail = roundResult.isDaily && roundResult.wordsFound !== roundResult.totalWords;
      // QUICK PLAY all-or-nothing rule: if even ONE word is missing when
      // the round ends, the round is a FAIL — no points credited at all,
      // and a 20-point penalty applies. Computed here so saveStats /
      // logRound both honour the rule.
      const isQuickPlayFail =
        !roundResult.isDaily &&
        !(roundResult.levelNumber > 0) &&
        roundResult.wordsFound < roundResult.totalWords;
      const failedRound = isDailyFail || isQuickPlayFail;
      await saveStats({
        // Passing 0 is a no-op (saveStats keeps the max). This guarantees
        // a partial fail-round score never gets promoted to highScore.
        highScore: failedRound ? 0 : sessionStats.score,
        bestStreak: failedRound ? 0 : Math.max(sessionStats.bestStreak || 0, sessionStats.streak || 0),
      });
      await logRound({
        category: roundResult.category || '',
        wordsFound: roundResult.wordsFound,
        totalWords: roundResult.totalWords,
        timeSpent: roundResult.timeSpent || 0,
        // Daily Challenge credits 5 pts/word IMMEDIATELY during the round
        // (see GameScreen), so we must NOT add roundScore again here or
        // totalScoreEver would double-count. Failed daily = 0 regardless.
        // Failed Quick Play = 0 regardless (all-or-nothing).
        roundScore: (roundResult.isDaily || isQuickPlayFail) ? 0 : (roundResult.roundScore || 0),
        perfect: roundResult.wordsFound === roundResult.totalWords,
        hintsUsed: roundResult.hintsUsed || 0,
      });
      // (learningPathAgent removed.) For Quick Play, still run coachAgent
      // with last-10-game context: win → motivational line, loss → full
      // diagnosis + next 3 rounds.
      if (user?.id) {
        const mode = roundResult.isDaily ? 'daily' : (roundResult.levelNumber > 0 ? 'level' : 'quick-play');
        if (mode === 'quick-play') {
          try {
            const won = roundResult.wordsFound >= roundResult.totalWords;
            const cf = await coachFeedback({
              userId: user.id,
              mode: 'quick-play',
              outcome: won ? 'win' : 'loss',
              wordsFound: roundResult.wordsFound || 0,
              totalWords: roundResult.totalWords || 0,
              timeLeft: roundResult.timeLeft || 0,
              hintsUsed: roundResult.hintsUsed || 0,
              category: roundResult.category || 'Mix',
              score: roundResult.roundScore || 0,
              bestStreak: roundResult.streak || 0,
              streak: roundResult.streak || 0,
            });
            if (cf?.ok) setCoach(cf);
          } catch (_) {}
        }
      }
      // If this was a numbered level (1-15) and the player completed it,
      // unlock the next level AND record their score as the level's best.
      if (roundResult.levelNumber > 0 && roundResult.wordsFound === roundResult.totalWords) {
        await completeLevel(roundResult.levelNumber);
        await recordLevelScore(roundResult.levelNumber, roundResult.roundScore || 0);
      }
      // Daily challenge: always mark as attempted (locks for 12 h).
      if (roundResult.isDaily) {
        await markDailyAttempt();
        trace('daily-result', isDailyFail ? 'failed' : 'completed', {
          wordsFound: roundResult.wordsFound, total: roundResult.totalWords,
          score: isDailyFail ? 0 : (roundResult.roundScore || 0),
        });
      }
      // Numbered Level Mode result.
      if (roundResult.levelNumber > 0) {
        trace('level-complete', `level ${roundResult.levelNumber}`, {
          levelNumber: roundResult.levelNumber,
          wordsFound: roundResult.wordsFound, total: roundResult.totalWords,
          passed: roundResult.wordsFound === roundResult.totalWords,
          score: roundResult.roundScore,
        });
      }
      // QUICK PLAY FAIL → apply 20-point penalty before checking tier
      // state. All-or-nothing: even one missing word triggers this branch.
      if (isQuickPlayFail) {
        try {
          // eslint-disable-next-line global-require
          const { applyQuickPlayFailPenalty } = require('../utils/penalty');
          const info = await applyQuickPlayFailPenalty({}, {
            wordsFound: roundResult.wordsFound,
            totalWords: roundResult.totalWords,
          });
          if (info) {
            setPenaltyInfo(info);
            trace('quick-play-fail', 'timeout', {
              wordsFound: roundResult.wordsFound,
              total: roundResult.totalWords,
            });
            if (info.downgrade) {
              setPendingTierDown(info.downgrade);
            }
          }
        } catch (_) {}
      }

      // Detect tier-up: logRound has just updated totalScoreEver, so read
      // the fresh value and compare against lastSeenTier.
      try {
        const fresh = await loadStats();
        const delta = tierUpDelta(fresh.lastSeenTier || 'bronze', fresh.totalScoreEver || 0);
        if (delta) setPendingTierUp(delta);
      } catch (_) {}
      // Push the latest local stats up to Supabase (no-op if not logged in).
      syncUp().catch(() => {});
      setLoading(false);
    })();
  }, []);

  const { wordsFound, totalWords, timeLeft, roundScore } = roundResult;
  const ratio = totalWords > 0 ? wordsFound / totalWords : 0;
  // Level Mode + Daily Challenge = strict pass/fail. Even ONE missing word
  // when the timer runs out means the level failed. Only Quick Play keeps
  // the 3-tier star system.
  const isDailyRound = !!roundResult.isDaily;
  const isLevelMode = roundResult.levelNumber > 0;
  // All modes are now all-or-nothing: 3 stars only when EVERY word is
  // found, otherwise 0 stars + ROUND FAILED state. Quick Play used to
  // allow 1/2 stars for partial completion which contradicted the
  // all-or-nothing penalty rule — leading to "LEVEL COMPLETED" headers
  // appearing on rounds that actually failed.
  const stars = ratio === 1 ? 3 : 0;
  const isFailed = stars === 0;
  // Quick Play all-or-nothing: any missing word = round fail = ZERO points.
  const isQuickPlayFailView = !isDailyRound && !isLevelMode && isFailed;
  const effectiveScore = (isDailyRound && isFailed) || isQuickPlayFailView ? 0 : roundScore;
  const heroTitle = isFailed ? 'ROUND FAILED!' : 'LEVEL COMPLETED';
  const heroSub = isFailed
    ? (isQuickPlayFailView
        ? (penaltyInfo
            ? `−${penaltyInfo.penalty} points. Find every word to keep them all.`
            : 'Round failed. Find every word to keep them all.')
        : 'Better luck next time! 💔')
    : stars === 3 ? 'Perfect! Every word found 🏆'
    : stars === 2 ? 'Good work — keep going!'
    : 'Passed — try the next level';
  const accent = isFailed ? '#ef4444' : stars === 3 ? theme.accent : stars === 2 ? theme.gold : '#fb923c';

  const winEmojis = ['🇵🇰', '🎉', '✨', '⭐', '🏆', '🥳', '🎊', '👑', '💚', '🌟', '🎆', '🪅'];
  const failEmojis = ['😢', '💔', '😭', '☹️', '🥺', '😞', '⛈', '🌧'];

  return (
    <ImageBackground source={BG} style={styles.container} resizeMode="cover">
      <View style={styles.tealTint} />
      <View style={[styles.blob, { backgroundColor: accent, top: -100, right: -80 }]} />
      <Confetti
        visible={showConfetti}
        count={42}
        duration={2400}
        emojis={isFailed ? failEmojis : winEmojis}
        onDone={() => setShowConfetti(false)}
      />
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* WOODEN-PLANK STYLE HERO */}
          <Animated.View style={[styles.hero, { opacity: fadeIn, transform: [{ scale: heroScale }] }]}>
            <View
              style={[
                styles.plank,
                {
                  backgroundColor: isFailed ? '#4b1d1d' : '#92400e',
                  borderColor: isFailed ? '#7f1d1d' : '#fb923c',
                  shadowColor: accent,
                },
              ]}
            >
              {/* Leaf decorations (left/right) */}
              <Text style={[styles.leaf, { left: -10, top: 12 }]}>🌿</Text>
              <Text style={[styles.leaf, { right: -10, top: 12 }]}>🌿</Text>

              {/* Stars row */}
              <View style={styles.starsRow}>
                <Text style={[styles.star, { fontSize: 36, opacity: stars >= 1 ? 1 : 0.18 }]}>
                  {stars >= 1 ? '⭐' : '☆'}
                </Text>
                <Text style={[styles.star, styles.starBig, { opacity: stars >= 2 ? 1 : 0.18 }]}>
                  {stars >= 2 ? '⭐' : '☆'}
                </Text>
                <Text style={[styles.star, { fontSize: 36, opacity: stars >= 3 ? 1 : 0.18 }]}>
                  {stars >= 3 ? '⭐' : '☆'}
                </Text>
              </View>

              {/* Bottom title bar */}
              <View
                style={[
                  styles.bannerBar,
                  {
                    backgroundColor: isFailed ? '#7f1d1d' : '#c2410c',
                    borderColor: isFailed ? '#ef4444' : '#fb923c',
                  },
                ]}
              >
                <Text style={styles.ropeL}>⎯</Text>
                <Text style={[styles.bannerText, { color: '#fff' }]}>{heroTitle}</Text>
                <Text style={styles.ropeR}>⎯</Text>
              </View>
            </View>

            <Text style={[styles.heroSub, { color: '#94a3b8', marginTop: 14 }]}>{heroSub}</Text>

            {/* "+points earned" is ONLY shown on a win. On a fail we hide
                this block entirely — the penalty card below carries the
                round result instead. */}
            {!isFailed ? (
              <>
                <Animated.Text
                  style={[
                    styles.heroScore,
                    {
                      color: accent,
                      transform: [{
                        scale: scoreFlash.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] }),
                      }],
                    },
                  ]}
                >
                  {`+${effectiveScore}`}
                </Animated.Text>
                <Text style={styles.heroScoreLabel}>points earned</Text>
              </>
            ) : null}
          </Animated.View>

          {/* Quick Play fail penalty card — only shown when penalty applied */}
          {penaltyInfo ? (
            <Animated.View style={[styles.penaltyCard, { opacity: fadeIn }]}>
              <Text style={styles.penaltyTitle}>ROUND FAILED!</Text>
              <Text style={styles.penaltyDelta}>−{penaltyInfo.penalty} points</Text>
              {/* Breakdown so the player understands the proportional fee. */}
              <View style={styles.penaltyBreakdown}>
                <View style={styles.penaltyBreakdownRow}>
                  <Text style={styles.penaltyBreakdownLabel}>Words found</Text>
                  <Text style={styles.penaltyBreakdownVal}>
                    {penaltyInfo.wordsFound != null ? penaltyInfo.wordsFound : roundResult.wordsFound}
                    {' / '}
                    {penaltyInfo.totalWords != null ? penaltyInfo.totalWords : roundResult.totalWords}
                  </Text>
                </View>
                <View style={styles.penaltyBreakdownRow}>
                  <Text style={styles.penaltyBreakdownLabel}>Completion</Text>
                  <Text style={styles.penaltyBreakdownVal}>
                    {penaltyInfo.completionPct != null ? penaltyInfo.completionPct : 0}%
                  </Text>
                </View>
                <View style={styles.penaltyBreakdownRow}>
                  <Text style={styles.penaltyBreakdownLabel}>Penalty</Text>
                  <Text style={[styles.penaltyBreakdownVal, { color: '#fca5a5' }]}>
                    −{penaltyInfo.penalty} pts
                  </Text>
                </View>
                <View style={[styles.penaltyBreakdownRow, styles.penaltyBreakdownTotal]}>
                  <Text style={styles.penaltyBreakdownLabel}>New total</Text>
                  <Text style={styles.penaltyBreakdownVal}>💰 {penaltyInfo.newTotal} pts</Text>
                </View>
              </View>
              <View style={styles.penaltyRow}>
                <View style={styles.penaltyCol}>
                  <Text style={styles.penaltyLabel}>CURRENT TIER</Text>
                  <Text style={styles.penaltyVal}>
                    {(require('../utils/tiers').TIERS.find((t) => t.key === penaltyInfo.newTier) || {}).emoji}{' '}
                    {(require('../utils/tiers').TIERS.find((t) => t.key === penaltyInfo.newTier) || {}).name}
                  </Text>
                </View>
              </View>
              {penaltyInfo.downgrade ? (
                <Text style={styles.tierDropText}>
                  ⬇ Tier dropped to{' '}
                  {(require('../utils/tiers').TIERS.find((t) => t.key === penaltyInfo.downgrade.toTier) || {}).name}
                </Text>
              ) : null}
            </Animated.View>
          ) : null}

          {/* Stat tiles */}
          <Animated.View style={[styles.statsRow, { opacity: fadeIn }]}>
            <View style={styles.statTile}>
              <Text style={styles.statEmoji}>🔤</Text>
              <Text style={styles.statValue}>{wordsFound}/{totalWords}</Text>
              <Text style={styles.statLabel}>WORDS</Text>
            </View>
            <View style={styles.statTile}>
              <Text style={styles.statEmoji}>⏱</Text>
              <Text style={styles.statValue}>{timeLeft}s</Text>
              <Text style={styles.statLabel}>TIME LEFT</Text>
            </View>
            <View style={styles.statTile}>
              <Text style={styles.statEmoji}>💰</Text>
              <Text style={styles.statValue}>{sessionStats.score}</Text>
              <Text style={styles.statLabel}>TOTAL</Text>
            </View>
          </Animated.View>

          {/* AI analysis loading or content */}
          {loading ? (
            <View style={[styles.card, { alignItems: 'center', paddingVertical: 24 }]}>
              <ActivityIndicator color="#22c55e" />
              <Text style={styles.loadingText}>AI agent analysis...</Text>
            </View>
          ) : (
            <>
              {/* Encouragement */}
              {reward?.encouragement ? (
                <View style={[styles.card, styles.encourageCard]}>
                  <Text style={styles.encourageText}>{reward.encouragement}</Text>
                </View>
              ) : null}

              {/* AI Preview */}
              {reward?.nextRoundPreview ? (
                <View style={[styles.card, styles.aiCard]}>
                  <View style={styles.aiHeader}>
                    <Text style={styles.aiAvatar}>🤖</Text>
                    <Text style={styles.aiLabel}>AI AGENT · {isFailed ? 'Try Again' : 'Next Round'}</Text>
                  </View>
                  <Text style={styles.aiText}>{reward.nextRoundPreview}</Text>
                </View>
              ) : null}

              {/* COACH AGENT — long-term-memory diagnosis. Quick Play only.
                  Win path = warm one-liner. Loss path = improvements +
                  how-to-fix + auto-generated next-3-rounds buttons. */}
              {coach ? (
                <View style={[styles.card, styles.coachCard]}>
                  <View style={styles.aiHeader}>
                    <Text style={styles.aiAvatar}>🎓</Text>
                    <Text style={styles.coachLabel}>
                      COACH · LAST {coach.memoryUsed || 0} GAMES
                    </Text>
                  </View>
                  <Text style={styles.coachHeadline}>{coach.headline}</Text>

                  {/* GOOD POINTS — tricks that worked THIS round. Shown on
                      every match (win + loss), so the kid always learns
                      what to repeat. */}
                  {Array.isArray(coach.goodMoves) && coach.goodMoves.length ? (
                    <View style={{ marginTop: 12, gap: 4 }}>
                      <Text style={styles.coachGoodTitle}>✅ GOOD POINTS</Text>
                      {coach.goodMoves.map((g, i) => (
                        <Text key={'gm' + i} style={styles.coachGoodLine}>• {g}</Text>
                      ))}
                    </View>
                  ) : null}

                  {/* LONG-TERM STRENGTHS — what the player consistently does
                      well across the last N games. */}
                  {Array.isArray(coach.strengths) && coach.strengths.length ? (
                    <View style={{ marginTop: 10, gap: 4 }}>
                      <Text style={styles.coachStrengthTitle}>💪 YOUR STRENGTHS</Text>
                      {coach.strengths.map((s, i) => (
                        <Text key={'st' + i} style={styles.coachStrengthLine}>
                          • {typeof s === 'string' ? s : (s.label || s.key)}
                        </Text>
                      ))}
                    </View>
                  ) : null}

                  {/* IMPROVEMENTS — shown on EVERY outcome. On a win these
                      are lite "next time push for…" pointers; on a loss
                      they're full diagnostics. Always paired 1:1 with
                      howToFix. */}
                  {Array.isArray(coach.improvements) && coach.improvements.length ? (
                    <View style={{ marginTop: 12, gap: 6 }}>
                      <Text style={styles.coachImpTitle}>
                        {coach.outcome === 'win' ? '🎯 PUSH NEXT TIME' : '⚠ IMPROVE HERE'}
                      </Text>
                      {coach.improvements.map((imp, i) => (
                        <View key={'imp' + i}>
                          <Text style={styles.coachImp}>{coach.outcome === 'win' ? '•' : '⚠'} {imp}</Text>
                          {coach.howToFix?.[i] ? (
                            <Text style={styles.coachFix}>↳ {coach.howToFix[i]}</Text>
                          ) : null}
                        </View>
                      ))}
                    </View>
                  ) : null}
                  {coach.outcome === 'loss' && Array.isArray(coach.nextRounds) && coach.nextRounds.length ? (
                    <View style={{ marginTop: 14 }}>
                      <Text style={styles.coachNextTitle}>📋 NEXT 3 ROUNDS — PERSONALISED PLAN</Text>
                      {coach.nextRounds.map((r, i) => (
                        <TouchableOpacity
                          key={'nr' + i}
                          activeOpacity={0.85}
                          style={styles.coachNextItem}
                          onPress={() => {
                            if (r.mode === 'practice') {
                              navigation.replace('Practice', {
                                difficulty: r.difficulty || 'easy',
                                lastCategory: r.category || null,
                              });
                            } else if (r.mode === '1v1') {
                              navigation.replace('BattleQueue');
                            } else if (r.mode === 'tutor') {
                              navigation.replace('Tutor');
                            } else {
                              navigation.replace('Category', { playerStats, sessionStats });
                            }
                          }}
                        >
                          <Text style={styles.coachNextStep}>{i + 1}.</Text>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.coachNextLabel}>{r.title}</Text>
                            <Text style={styles.coachNextWhy}>{r.rationale}</Text>
                          </View>
                          <Text style={styles.coachNextArrow}>▸</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  ) : null}
                </View>
              ) : null}
            </>
          )}

          <View style={{ height: 20 }} />

          {/* CTAs */}
          <TouchableOpacity
            activeOpacity={0.9}
            style={[styles.primaryBtn, { shadowColor: accent }]}
            onPress={async () => {
              // DAILY CHALLENGE (win OR lose) → single-round mode, head home.
              if (isDailyRound) {
                navigateWithTierUpCheck('Home');
                return;
              }
              // FAILED LEVEL → retry the SAME level (same words, new grid).
              if (isFailed && roundResult.levelNumber > 0) {
                // eslint-disable-next-line global-require
                const { getLevelWords } = require('../utils/storage');
                const cached = await getLevelWords(roundResult.levelNumber);
                navigateWithTierUpCheck('Category', {
                  playerStats,
                  sessionStats: { ...sessionStats, score: 0, streak: 0, history: [] },
                  levelNumber: roundResult.levelNumber,
                  reshuffleWords: cached?.words || null,
                  reshuffleCategory: cached?.category || '',
                  reshuffleEmoji: cached?.emoji || '',
                  reshuffleFunFact: cached?.funFact || '',
                });
                return;
              }
              // PASSED LEVEL → advance to next level number.
              if (!isFailed && roundResult.levelNumber > 0) {
                navigateWithTierUpCheck('Category', {
                  playerStats,
                  sessionStats,
                  levelNumber: Math.min(15, roundResult.levelNumber + 1),
                });
                return;
              }
              // Quick Play / daily / etc → unchanged adaptive flow.
              // The next Category screen will read the (now updated) tier
              // and pick the new tier's difficulty automatically.
              navigateWithTierUpCheck('Category', { playerStats, sessionStats });
            }}
          >
            <Text style={styles.primaryArrow}>
              {isDailyRound ? '🏠' : isFailed ? '↻' : '▶'}
            </Text>
            <Text style={styles.primaryText}>
              {isDailyRound
                ? 'BACK TO HOME'
                : isFailed && roundResult.levelNumber > 0
                ? `TRY AGAIN · LEVEL ${roundResult.levelNumber}`
                : !isFailed && roundResult.levelNumber > 0
                ? `NEXT LEVEL ${Math.min(15, roundResult.levelNumber + 1)}`
                : isFailed
                ? 'TRY AGAIN'
                : 'NEXT ROUND'}
            </Text>
          </TouchableOpacity>

          <View style={styles.secondaryRow}>
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => navigateWithTierUpCheck('Home')}
            >
              <Text style={styles.secondaryText}>🏠 Home</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => navigation.navigate('Stats')}
            >
              <Text style={styles.secondaryText}>📊 Stats</Text>
            </TouchableOpacity>
          </View>

          <View style={{ height: 30 }} />
        </ScrollView>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, overflow: 'hidden' },
  tealTint: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(13,80,80,0.55)' },
  blob: { position: 'absolute', width: 280, height: 280, borderRadius: 140, opacity: 0.15 },
  scroll: { padding: 18, gap: 12 },

  hero: { alignItems: 'center', paddingTop: 10, paddingBottom: 4 },
  heroCircle: {
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: '#0b1220',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3,
    shadowOpacity: 0.6, shadowRadius: 24, shadowOffset: { width: 0, height: 0 },
    elevation: 12,
  },
  heroEmoji: { fontSize: 64 },
  heroTitle: { fontSize: 26, fontWeight: '900', marginTop: 12, letterSpacing: 1 },

  // Wooden plank (level complete / failed)
  plank: {
    width: '94%', alignSelf: 'center',
    paddingTop: 22, paddingBottom: 56, paddingHorizontal: 18,
    borderRadius: 20, borderWidth: 3,
    borderBottomWidth: 9, borderBottomColor: '#451a03',
    alignItems: 'center', justifyContent: 'center',
    shadowOpacity: 0.5, shadowRadius: 22, shadowOffset: { width: 0, height: 8 }, elevation: 12,
    position: 'relative',
  },
  leaf: { position: 'absolute', fontSize: 38 },
  starsRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 8 },
  star: { fontSize: 36, color: '#fcd34d' },
  starBig: { fontSize: 52, marginBottom: 4, color: '#fcd34d' },
  bannerBar: {
    position: 'absolute', bottom: -8, left: 24, right: 24,
    paddingVertical: 10, borderRadius: 14, borderWidth: 3,
    borderBottomWidth: 6, borderBottomColor: 'rgba(0,0,0,0.45)',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    shadowOpacity: 0.4, shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
  },
  bannerText: {
    fontSize: 16, fontWeight: '900', letterSpacing: 2,
    textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 2,
  },
  ropeL: { color: '#fff', fontSize: 16, fontWeight: '900' },
  ropeR: { color: '#fff', fontSize: 16, fontWeight: '900' },
  heroSub: {
    color: '#fef3c7', marginTop: 4, fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.55)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2,
  },
  heroScore: {
    fontSize: 54, fontWeight: '900', marginTop: 12,
    textShadowColor: 'rgba(0,0,0,0.55)', textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 4,
  },
  heroScoreLabel: { color: '#fde68a', fontSize: 11, letterSpacing: 1.5, fontWeight: '900' },

  penaltyCard: {
    backgroundColor: 'rgba(127,29,29,0.85)',
    borderRadius: 18, padding: 14, marginTop: 4,
    borderWidth: 3, borderColor: '#ef4444',
    borderBottomWidth: 7, borderBottomColor: '#450a0a',
    alignItems: 'center',
  },
  penaltyTitle: {
    color: '#fff', fontSize: 16, fontWeight: '900', letterSpacing: 2,
    textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2,
  },
  penaltyDelta: {
    color: '#fca5a5', fontSize: 28, fontWeight: '900', marginTop: 4,
    textShadowColor: 'rgba(0,0,0,0.55)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 3,
  },
  penaltyBreakdown: {
    alignSelf: 'stretch', marginTop: 12,
    paddingVertical: 8, paddingHorizontal: 10,
    backgroundColor: 'rgba(0,0,0,0.18)', borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(252,165,165,0.3)',
  },
  penaltyBreakdownRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 4,
  },
  penaltyBreakdownTotal: {
    borderTopWidth: 1, borderTopColor: 'rgba(252,165,165,0.35)',
    marginTop: 4, paddingTop: 8,
  },
  penaltyBreakdownLabel: { color: '#fecaca', fontSize: 12, fontWeight: '700' },
  penaltyBreakdownVal: { color: '#fff', fontSize: 13, fontWeight: '900' },
  penaltyRow: { flexDirection: 'row', gap: 12, marginTop: 10, alignSelf: 'stretch' },
  penaltyCol: { flex: 1, alignItems: 'center' },
  penaltyLabel: { color: '#fecaca', fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  penaltyVal: {
    color: '#fff', fontSize: 15, fontWeight: '900', marginTop: 2,
    textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2,
  },
  tierDropText: {
    color: '#fca5a5', fontSize: 13, fontWeight: '900', marginTop: 10,
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2,
  },

  statsRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  statTile: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.85)',
    borderRadius: 16,
    padding: 14,
    alignItems: 'center',
    borderWidth: 3, borderColor: '#fff',
    borderBottomWidth: 7, borderBottomColor: '#0f172a',
  },
  statEmoji: { fontSize: 22 },
  statValue: {
    color: '#fff', fontSize: 20, fontWeight: '900', marginTop: 4,
    textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2,
  },
  statLabel: { color: '#fde68a', fontSize: 9, fontWeight: '900', letterSpacing: 1, marginTop: 2 },

  card: {
    backgroundColor: 'rgba(15,23,42,0.85)',
    borderRadius: 18,
    padding: 14,
    borderWidth: 3, borderColor: '#fff',
    borderBottomWidth: 7, borderBottomColor: '#0f172a',
  },
  badgeCard: { borderColor: '#fcd34d' },
  sectionTitle: { color: '#fcd34d', fontWeight: '900', fontSize: 12, letterSpacing: 1.5 },
  badgeItem: {
    backgroundColor: 'rgba(252, 211, 77, 0.08)',
    borderRadius: 12, padding: 12,
    borderLeftWidth: 3, borderLeftColor: '#fcd34d',
  },
  badgeName: { color: '#fff', fontWeight: '800', fontSize: 15 },
  badgeMsg: { color: '#cbd5e1', marginTop: 2, fontSize: 13 },

  encourageCard: { borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.18)' },
  encourageText: { color: '#dcfce7', fontSize: 14, textAlign: 'center', fontWeight: '700', fontStyle: 'italic' },

  aiCard: { borderColor: '#a78bfa' },
  aiHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  aiAvatar: { fontSize: 18 },
  aiLabel: { color: '#c4b5fd', fontWeight: '900', fontSize: 11, letterSpacing: 1.2 },
  aiText: { color: '#ede9fe', fontSize: 14, lineHeight: 20, fontWeight: '600' },

  loadingText: { color: '#fde68a', marginTop: 10, fontWeight: '700' },

  coachCard: { borderColor: '#38bdf8', backgroundColor: 'rgba(8,47,73,0.85)' },
  coachLabel: { color: '#7dd3fc', fontWeight: '900', fontSize: 11, letterSpacing: 1.2 },
  coachHeadline: { color: '#fff', fontSize: 15, fontWeight: '800', lineHeight: 21, marginTop: 4 },
  coachImp: { color: '#fde68a', fontSize: 13, fontWeight: '700', lineHeight: 18 },
  coachFix: { color: '#bae6fd', fontSize: 12, fontWeight: '600', lineHeight: 17, marginLeft: 14, marginTop: 1 },
  coachGoodTitle: { color: '#86efac', fontWeight: '900', fontSize: 11, letterSpacing: 1.2, marginBottom: 2 },
  coachGoodLine: { color: '#dcfce7', fontSize: 13, fontWeight: '700', lineHeight: 18 },
  coachStrengthTitle: { color: '#c4b5fd', fontWeight: '900', fontSize: 11, letterSpacing: 1.2, marginBottom: 2 },
  coachStrengthLine: { color: '#ede9fe', fontSize: 13, fontWeight: '700', lineHeight: 18 },
  coachImpTitle: { color: '#fcd34d', fontWeight: '900', fontSize: 11, letterSpacing: 1.2, marginBottom: 2 },
  coachNextTitle: {
    color: '#fcd34d', fontWeight: '900', fontSize: 11, letterSpacing: 1.2, marginBottom: 8,
  },
  coachNextItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(8,47,73,0.7)',
    borderRadius: 12, padding: 10,
    borderWidth: 2, borderColor: 'rgba(56,189,248,0.35)',
    marginBottom: 6,
  },
  coachNextStep: { color: '#7dd3fc', fontSize: 16, fontWeight: '900', width: 22 },
  coachNextLabel: { color: '#fff', fontWeight: '900', fontSize: 13 },
  coachNextWhy: { color: '#bae6fd', fontSize: 11, marginTop: 1 },
  coachNextArrow: { color: '#fcd34d', fontSize: 22, fontWeight: '900' },

  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: '#22c55e', borderRadius: 999, paddingVertical: 18,
    borderWidth: 3, borderColor: '#fff',
    borderBottomWidth: 9, borderBottomColor: '#14532d',
    shadowOpacity: 0.55, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 14,
  },
  primaryArrow: {
    color: '#fff', fontSize: 20, fontWeight: '900',
    textShadowColor: 'rgba(0,0,0,0.45)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 2,
  },
  primaryText: {
    color: '#fff', fontSize: 17, fontWeight: '900', letterSpacing: 2,
    textShadowColor: 'rgba(0,0,0,0.45)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 2,
  },

  secondaryRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  secondaryBtn: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.85)',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 3, borderColor: '#fff',
    borderBottomWidth: 7, borderBottomColor: '#0f172a',
  },
  secondaryText: {
    color: '#fff', fontWeight: '900', letterSpacing: 0.5,
    textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2,
  },
});
