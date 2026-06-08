import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Text, StyleSheet, Animated } from 'react-native';

const Timer = forwardRef(function Timer({ timeLimit, onTimeUp, onTick, paused }, ref) {
  const [timeLeft, setTimeLeft] = useState(timeLimit);
  const pulse = useRef(new Animated.Value(1)).current;
  const bumpAnim = useRef(new Animated.Value(0)).current;
  const [showBump, setShowBump] = useState(false);

  useEffect(() => {
    setTimeLeft(timeLimit);
  }, [timeLimit]);

  useImperativeHandle(ref, () => ({
    // Extend the running countdown without resetting it. Used by Quick
    // Play and Daily Challenge to reward each successful word find with
    // +5 seconds. A floating "+Ns" pops above the timer for feedback.
    addSeconds: (n) => {
      const add = Number(n) || 0;
      if (add <= 0) return;
      setTimeLeft((t) => Math.max(0, t + add));
      onTick && onTick(timeLeft + add);
      setShowBump(true);
      bumpAnim.setValue(0);
      Animated.sequence([
        Animated.timing(bumpAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.delay(420),
        Animated.timing(bumpAnim, { toValue: 0, duration: 240, useNativeDriver: true }),
      ]).start(() => setShowBump(false));
    },
  }), [timeLeft, onTick]);

  useEffect(() => {
    if (paused) return undefined;
    if (timeLeft <= 0) {
      onTimeUp && onTimeUp();
      return undefined;
    }
    const id = setTimeout(() => {
      setTimeLeft(t => {
        const next = t - 1;
        onTick && onTick(next);
        return next;
      });
    }, 1000);
    return () => clearTimeout(id);
  }, [timeLeft, paused]);

  useEffect(() => {
    if (timeLeft < 15) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1.2, duration: 300, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1, duration: 300, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulse.setValue(1);
    }
  }, [timeLeft < 15]);

  const color = timeLeft > 30 ? '#22c55e' : timeLeft >= 15 ? '#eab308' : '#ef4444';
  const bumpY = bumpAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -22] });
  const bumpOpacity = bumpAnim.interpolate({ inputRange: [0, 0.2, 0.8, 1], outputRange: [0, 1, 1, 0] });

  return (
    <Animated.View style={{ transform: [{ scale: pulse }] }}>
      <Text style={[styles.timer, { color }]}>⏱ {timeLeft}s</Text>
      {showBump ? (
        <Animated.Text style={[styles.bump, { transform: [{ translateY: bumpY }], opacity: bumpOpacity }]}>
          +5s
        </Animated.Text>
      ) : null}
    </Animated.View>
  );
});

export default Timer;

const styles = StyleSheet.create({
  timer: { fontSize: 22, fontWeight: 'bold' },
  bump: {
    position: 'absolute', alignSelf: 'center', top: 0,
    color: '#22c55e', fontSize: 14, fontWeight: '900',
    textShadowColor: 'rgba(0,0,0,0.55)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2,
  },
});
