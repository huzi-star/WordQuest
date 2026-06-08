import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ImageBackground, Image, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useSettings } from '../utils/settings';
import { useAuth } from '../utils/auth';
import { uploadAvatarPhoto } from '../utils/supabase';
import { trace } from '../utils/trace';
import { rs, rfs, wp, IS_SMALL } from '../utils/responsive';

const BG = require('../../home_design/home_bg.jpeg');

const AVATAR_EMOJIS = ['🦊','🐼','🐯','🐸','🐻','🦁','🐮','🐷','🐵','🐱','🐶','🐰','🐺','🐹','🦝','🦄','🐲','🐢','🐙','🦋'];
const COLORS = ['#7c3aed','#22c55e','#3b82f6','#ec4899','#f97316','#06b6d4','#facc15','#a855f7','#ef4444','#14b8a6'];
const BORDERS = [
  { key: 'gold',   name: 'Gold',    color: '#facc15' },
  { key: 'silver', name: 'Silver',  color: '#94a3b8' },
  { key: 'flame',  name: 'Flame',   color: '#ef4444' },
  { key: 'frost',  name: 'Frost',   color: '#0ea5e9' },
  { key: 'magic',  name: 'Magic',   color: '#a855f7' },
  { key: 'leaf',   name: 'Leaf',    color: '#22c55e' },
];

export default function AvatarScreen({ navigation }) {
  const { settings, setSetting } = useSettings();
  const { user } = useAuth();
  const [emoji, setEmoji] = useState(settings.avatarEmoji || '🦊');
  const [color, setColor] = useState(settings.avatarColor || COLORS[0]);
  const [border, setBorder] = useState(settings.avatarBorder || 'gold');
  const [photoUrl, setPhotoUrl] = useState(settings.avatarUrl || null);
  const [uploading, setUploading] = useState(false);

  async function pickPhoto() {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { Alert.alert('Permission needed', 'Please allow photo access.'); return; }
      const r = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true, aspect: [1, 1], quality: 0.7,
      });
      if (r.canceled || !r.assets?.[0]?.uri) return;
      const uri = r.assets[0].uri;
      if (!user?.id) { Alert.alert('Login required', 'Sign in to save photos to cloud.'); setPhotoUrl(uri); return; }
      setUploading(true);
      // Show the local preview instantly so the user sees their choice
      // even before the cloud upload finishes.
      setPhotoUrl(uri);
      const result = await uploadAvatarPhoto(user.id, uri);
      setUploading(false);
      if (result?.ok && result.publicUrl) {
        setPhotoUrl(result.publicUrl);
        // Persist immediately so Home / Leaderboard pick it up on next focus.
        setSetting('avatarUrl', result.publicUrl);
        trace('avatar-upload', 'photo uploaded', { url: result.publicUrl }, { userId: user?.id });
        Alert.alert('✅ Avatar saved!', 'Your new photo is now showing across the app.');
      } else {
        // Revert preview on failure.
        setPhotoUrl(settings.avatarUrl || null);
        trace('avatar-upload', 'photo upload failed', { error: result?.error }, { userId: user?.id, status: 'error' });
        const reason = result?.error || 'Unknown error.';
        const isMissingBucket = /bucket|not found|does not exist/i.test(reason);
        Alert.alert(
          'Upload failed',
          isMissingBucket
            ? `Storage bucket "avatars" is missing or not public. Ask the admin to run WQ_ALL_PATCH.sql in Supabase. Details: ${reason}`
            : `Could not save photo. Details: ${reason}`,
        );
      }
    } catch (e) { setUploading(false); Alert.alert('Error', e.message); }
  }

  function removePhoto() { setPhotoUrl(null); }

  function save() {
    setSetting('avatarEmoji', emoji);
    setSetting('avatarColor', color);
    setSetting('avatarBorder', border);
    setSetting('avatarUrl', photoUrl);
    navigation.goBack();
  }

  const borderColor = BORDERS.find((b) => b.key === border)?.color || '#facc15';

  return (
    <ImageBackground source={BG} style={styles.bg} resizeMode="cover">
      <View style={styles.tint} />
      <SafeAreaView style={{ flex: 1 }}>
        <View style={styles.header}>
          <TouchableOpacity activeOpacity={0.7} onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>🎨 Custom Avatar</Text>
          <Text style={styles.subtitle}>Upload a photo or choose an avatar</Text>
        </View>

        <ScrollView contentContainerStyle={styles.scroll}>
          {/* Live preview */}
          <View style={styles.preview}>
            <View style={[styles.avatarRing, { borderColor }]}>
              <View style={[styles.avatarFill, { backgroundColor: photoUrl ? '#0f172a' : color }]}>
                {photoUrl
                  ? (
                    <Image
                      source={{ uri: photoUrl }}
                      style={styles.avatarPhoto}
                      onError={() => { setPhotoUrl(null); }}
                    />
                  )
                  : <Text style={styles.avatarEmoji}>{emoji}</Text>}
              </View>
            </View>
            <Text style={styles.previewName}>Preview</Text>
          </View>

          {/* Photo upload */}
          <Text style={styles.section}>UPLOAD PHOTO</Text>
          <View style={styles.photoRow}>
            <TouchableOpacity activeOpacity={0.9} onPress={pickPhoto} disabled={uploading} style={styles.photoBtn}>
              {uploading ? <ActivityIndicator color="#fff" /> : <Text style={styles.photoBtnText}>📷 Choose from gallery</Text>}
            </TouchableOpacity>
            {photoUrl ? (
              <TouchableOpacity activeOpacity={0.85} onPress={removePhoto} style={styles.removeBtn}>
                <Text style={styles.removeText}>✕</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          <Text style={styles.section}>OR PICK AN AVATAR</Text>
          <View style={styles.grid}>
            {AVATAR_EMOJIS.map((e) => (
              <TouchableOpacity key={e} activeOpacity={0.7} onPress={() => { setEmoji(e); setPhotoUrl(null); }} style={[styles.cell, emoji === e && !photoUrl && styles.cellActive]}>
                <Text style={styles.cellEmoji}>{e}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.section}>COLOR</Text>
          <View style={styles.gridSmall}>
            {COLORS.map((c) => (
              <TouchableOpacity key={c} activeOpacity={0.7} onPress={() => setColor(c)} style={[styles.colorDot, { backgroundColor: c }, color === c && styles.colorDotActive]} />
            ))}
          </View>

          <Text style={styles.section}>NAMEPLATE BORDER</Text>
          <View style={styles.borderRow}>
            {BORDERS.map((b) => (
              <TouchableOpacity key={b.key} activeOpacity={0.7} onPress={() => setBorder(b.key)} style={[styles.borderChip, { borderColor: b.color }, border === b.key && { backgroundColor: b.color }]}>
                <Text style={[styles.borderChipText, border === b.key && { color: '#0f172a' }]}>{b.name}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity activeOpacity={0.9} onPress={save} style={styles.saveBtn}>
            <Text style={styles.saveText}>✓ Save avatar</Text>
          </TouchableOpacity>
          <View style={{ height: 30 }} />
        </ScrollView>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  tint: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,23,42,0.7)' },
  header: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 10 },
  backBtn: { paddingVertical: 4 },
  backText: { color: '#94a3b8', fontWeight: '800' },
  title: { color: '#fff', fontSize: 22, fontWeight: '900', marginTop: 4 },
  subtitle: { color: '#a855f7', fontSize: 11, fontWeight: '900', letterSpacing: 0.8 },

  scroll: { padding: 14 },
  preview: { alignItems: 'center', marginVertical: 12 },
  avatarRing: {
    width: rs(130), height: rs(130), borderRadius: rs(65),
    borderWidth: 5,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  avatarFill: {
    width: rs(110), height: rs(110), borderRadius: rs(55),
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    borderWidth: 2, borderColor: '#fff',
  },
  avatarEmoji: { fontSize: rfs(60) },
  avatarPhoto: { width: '100%', height: '100%' },
  previewName: { color: '#fff', fontSize: 13, fontWeight: '800', marginTop: 8, opacity: 0.85 },

  section: { color: '#fff', fontSize: 11, fontWeight: '900', letterSpacing: 1.5, marginTop: 14, marginBottom: 8 },

  photoRow: { flexDirection: 'row', gap: 8 },
  photoBtn: {
    flex: 1, backgroundColor: '#0ea5e9', paddingVertical: 12, borderRadius: 12,
    alignItems: 'center', borderWidth: 2, borderColor: '#7dd3fc',
  },
  photoBtnText: { color: '#fff', fontWeight: '900', fontSize: 13 },
  removeBtn: {
    width: 46, backgroundColor: '#ef4444', borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fca5a5',
  },
  removeText: { color: '#fff', fontSize: 18, fontWeight: '900' },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: IS_SMALL ? 'space-between' : 'flex-start' },
  cell: {
    width: IS_SMALL ? wp(15) : rs(50), height: IS_SMALL ? wp(15) : rs(50), borderRadius: 12,
    backgroundColor: 'rgba(15,23,42,0.7)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: 'transparent',
  },
  cellActive: { borderColor: '#facc15' },
  cellEmoji: { fontSize: rfs(26) },

  gridSmall: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  colorDot: { width: 40, height: 40, borderRadius: 20, borderWidth: 3, borderColor: 'transparent' },
  colorDotActive: { borderColor: '#fff' },

  borderRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  borderChip: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
    borderWidth: 2,
  },
  borderChipText: { color: '#fff', fontWeight: '900', fontSize: 12 },

  saveBtn: {
    marginTop: 18, paddingVertical: 14, borderRadius: 999,
    backgroundColor: '#a855f7',
    alignItems: 'center',
    borderWidth: 3, borderColor: '#fff',
    borderBottomWidth: 7, borderBottomColor: '#581c87',
  },
  saveText: { color: '#fff', fontWeight: '900', fontSize: 15, letterSpacing: 0.5 },
});
