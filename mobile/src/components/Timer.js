import React, { useEffect, useRef, useState } from 'react';
import { Text, StyleSheet, Animated } from 'react-native';

export default function Timer({ timeLimit, onTimeUp, onTick, paused }) {
  const [timeLeft, setTimeLeft] = useState(timeLimit);
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    setTimeLeft(timeLimit);
  }, [timeLimit]);

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

  return (
    <Animated.View style={{ transform: [{ scale: pulse }] }}>
      <Text style={[styles.timer, { color }]}>⏱ {timeLeft}s</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  timer: { fontSize: 22, fontWeight: 'bold' },
});
