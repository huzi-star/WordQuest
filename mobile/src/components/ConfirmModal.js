import React, { useEffect, useRef } from 'react';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet, Animated, Easing, Pressable,
} from 'react-native';
import { useTheme } from '../utils/theme';

// Premium reusable confirmation modal.
//
// Props:
//   visible        - bool, controls visibility
//   icon           - emoji shown above the title (e.g. '⚠️')
//   title          - bold title at the top
//   message        - secondary description text
//   cancelText     - left button label (outlined / secondary style)
//   confirmText    - right button label (filled / accent or danger style)
//   confirmVariant - 'danger' | 'primary'   (defaults to 'primary')
//   onCancel       - tapped Cancel / dismissed
//   onConfirm      - tapped the primary action
export default function ConfirmModal({
  visible,
  icon = '⚠️',
  title = '',
  message = '',
  cancelText = 'Cancel',
  confirmText = 'Confirm',
  confirmVariant = 'primary',
  onCancel,
  onConfirm,
}) {
  const theme = useTheme();
  const fade = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.85)).current;
  const slide = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    if (visible) {
      fade.setValue(0);
      scale.setValue(0.85);
      slide.setValue(20);
      Animated.parallel([
        Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true, easing: Easing.out(Easing.cubic) }),
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 7, tension: 90 }),
        Animated.spring(slide, { toValue: 0, useNativeDriver: true, friction: 7, tension: 80 }),
      ]).start();
    }
  }, [visible]);

  const dangerColor = '#ef4444';
  const confirmBg = confirmVariant === 'danger' ? dangerColor : theme.accent;
  const confirmFg = confirmVariant === 'danger' ? '#fff' : theme.bg;
  const titleColor = confirmVariant === 'danger' ? dangerColor : theme.accent;

  return (
    <Modal
      transparent
      visible={visible}
      onRequestClose={onCancel}
      animationType="none"
      statusBarTranslucent
    >
      {/* Background overlay (acts as a blur substitute on Android) */}
      <Animated.View style={[styles.overlay, { opacity: fade }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} />

        <Animated.View
          style={[
            styles.card,
            {
              backgroundColor: theme.card,
              borderColor: confirmVariant === 'danger' ? '#7f1d1d' : theme.accent,
              shadowColor: confirmVariant === 'danger' ? dangerColor : theme.accent,
              transform: [{ scale }, { translateY: slide }],
            },
          ]}
        >
          {/* Decorative top stripe */}
          <View
            style={[
              styles.topStripe,
              { backgroundColor: confirmVariant === 'danger' ? `${dangerColor}33` : `${theme.accent}33` },
            ]}
          />

          <View style={styles.iconCircle}>
            <Text style={styles.iconText}>{icon}</Text>
          </View>

          <Text style={[styles.title, { color: titleColor }]}>{title}</Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}

          <View style={styles.btnRow}>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={onCancel}
              style={[styles.btn, styles.cancelBtn, { borderColor: theme.border }]}
            >
              <Text style={[styles.cancelText, { color: '#cbd5e1' }]}>{cancelText}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={onConfirm}
              style={[
                styles.btn, styles.confirmBtn,
                { backgroundColor: confirmBg, shadowColor: confirmBg },
              ]}
            >
              <Text style={[styles.confirmText, { color: confirmFg }]}>{confirmText}</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(2, 6, 23, 0.78)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 22,
    paddingTop: 26,
    paddingBottom: 18,
    paddingHorizontal: 22,
    alignItems: 'center',
    borderWidth: 1.5,
    overflow: 'hidden',
    shadowOpacity: 0.45,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 24,
  },
  topStripe: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: 64,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  iconCircle: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: 'rgba(2, 6, 23, 0.55)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 14,
  },
  iconText: { fontSize: 30 },
  title: {
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  message: {
    color: '#cbd5e1',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 4,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 22,
    width: '100%',
  },
  btn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtn: {
    backgroundColor: 'rgba(148, 163, 184, 0.08)',
    borderWidth: 1,
  },
  confirmBtn: {
    shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 8,
  },
  cancelText: { fontWeight: '700', fontSize: 14, letterSpacing: 0.3 },
  confirmText: { fontWeight: '900', fontSize: 14, letterSpacing: 0.5 },
});
