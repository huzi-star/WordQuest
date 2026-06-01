// One-shot script that synthesizes two short WAV files:
//   * sfx_win.wav         — cheerful 4-note ascending fanfare (~1.1s)
//   * sfx_word_found.wav  — quick 2-note "pop" / ding (~0.3s)
//
// Run with:  node assets/sounds/_generate.js
//
// PCM 16-bit, 22050 Hz, mono. Output is plain WAV — playable by expo-av.

const fs = require('fs');
const path = require('path');

const SR = 22050;

function envelope(t, dur, attack = 0.01, release = 0.15) {
  // Simple attack-decay-release envelope, peak = 1.
  if (t < attack) return t / attack;
  if (t > dur - release) return Math.max(0, (dur - t) / release);
  return 1;
}

function tone({ freq, dur, amp = 0.55, attack = 0.01, release = 0.15, vibrato = 0, harmonics = [1, 0.4, 0.18] }) {
  const n = Math.floor(SR * dur);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const vib = vibrato ? Math.sin(2 * Math.PI * 5 * t) * vibrato : 0;
    let sample = 0;
    for (let h = 0; h < harmonics.length; h++) {
      const w = 2 * Math.PI * freq * (h + 1) * (1 + vib);
      sample += Math.sin(w * t) * harmonics[h];
    }
    sample *= envelope(t, dur, attack, release);
    out[i] = sample * amp;
  }
  return out;
}

function concat(buffers) {
  const total = buffers.reduce((s, b) => s + b.length, 0);
  const out = new Float32Array(total);
  let off = 0;
  for (const b of buffers) { out.set(b, off); off += b.length; }
  return out;
}

function mix(buffers) {
  const total = Math.max(...buffers.map((b) => b.length));
  const out = new Float32Array(total);
  for (const b of buffers) for (let i = 0; i < b.length; i++) out[i] += b[i];
  // Soft-clip
  for (let i = 0; i < out.length; i++) out[i] = Math.tanh(out[i] * 0.9);
  return out;
}

function writeWav(samples, filePath) {
  const pcm = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    let s = Math.max(-1, Math.min(1, samples[i]));
    pcm.writeInt16LE(Math.round(s * 0x7fff), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);            // PCM chunk size
  header.writeUInt16LE(1, 20);             // PCM
  header.writeUInt16LE(1, 22);             // mono
  header.writeUInt32LE(SR, 24);
  header.writeUInt32LE(SR * 2, 28);        // byte rate
  header.writeUInt16LE(2, 32);             // block align
  header.writeUInt16LE(16, 34);            // bits/sample
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  fs.writeFileSync(filePath, Buffer.concat([header, pcm]));
  console.log(`wrote ${filePath} (${samples.length} samples, ${(samples.length / SR).toFixed(2)}s)`);
}

// ------------------------------------------------------------------ win jingle
// C5 E5 G5 C6 ascending fanfare with a final shimmer chord.
const N = { C5: 523.25, E5: 659.25, G5: 783.99, C6: 1046.50, E6: 1318.51, G6: 1567.98 };

const beat = 0.18;
const winNotes = [
  tone({ freq: N.C5, dur: beat,       amp: 0.55, release: 0.08 }),
  tone({ freq: N.E5, dur: beat,       amp: 0.55, release: 0.08 }),
  tone({ freq: N.G5, dur: beat,       amp: 0.6,  release: 0.08 }),
  tone({ freq: N.C6, dur: beat * 0.9, amp: 0.65, release: 0.08 }),
];
// Final shimmering major chord (C6 + E6 + G6) with bell-like harmonics.
const chordDur = 0.55;
const chord = mix([
  tone({ freq: N.C6, dur: chordDur, amp: 0.45, release: 0.45, harmonics: [1, 0.3, 0.12, 0.05] }),
  tone({ freq: N.E6, dur: chordDur, amp: 0.38, release: 0.45, harmonics: [1, 0.3, 0.12, 0.05] }),
  tone({ freq: N.G6, dur: chordDur, amp: 0.34, release: 0.45, harmonics: [1, 0.3, 0.12, 0.05] }),
]);
const winBuf = concat([...winNotes, chord]);

writeWav(winBuf, path.join(__dirname, 'sfx_win.wav'));

// ------------------------------------------------------------------ word-found pop
// Bright two-note pop: A5 -> E6 with very fast attack + short release.
const pop = concat([
  tone({ freq: 880,  dur: 0.07, amp: 0.55, attack: 0.003, release: 0.05, harmonics: [1, 0.5, 0.25] }),
  tone({ freq: 1318, dur: 0.18, amp: 0.6,  attack: 0.003, release: 0.13, harmonics: [1, 0.45, 0.22] }),
]);
writeWav(pop, path.join(__dirname, 'sfx_word_found.wav'));

console.log('done.');
