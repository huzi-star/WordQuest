import React, { useEffect, useRef, useState } from 'react';
import { Text } from 'react-native';

// Smoothly ticks the displayed number from its previous value to the new
// value over `duration` ms using requestAnimationFrame.
export default function AnimatedNumber({ value = 0, duration = 600, style, prefix = '', suffix = '' }) {
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(value);
  const startRef = useRef(0);
  const rafRef = useRef(null);

  useEffect(() => {
    const from = prevRef.current;
    const to = value;
    if (from === to) {
      setDisplay(to);
      return undefined;
    }
    startRef.current = Date.now();

    const tick = () => {
      const elapsed = Date.now() - startRef.current;
      const ratio = Math.min(1, elapsed / duration);
      // Ease out cubic for natural feel.
      const eased = 1 - Math.pow(1 - ratio, 3);
      const current = Math.round(from + (to - from) * eased);
      setDisplay(current);
      if (ratio < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        prevRef.current = to;
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value, duration]);

  return (
    <Text style={style}>
      {prefix}
      {display.toLocaleString()}
      {suffix}
    </Text>
  );
}
