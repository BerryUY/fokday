// Synthesizes FokDay's reward sound (no samples, no licenses): node scripts/generate-sounds.mjs
// A short two-note "clink": G6 then C7, each a bell-like tone (fundamental + inharmonic partials)
// with a fast attack and exponential decay. 16-bit mono WAV.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RATE = 44100;

function bell(freq, start, duration, gain, out) {
  // Partials of a small bell: relative frequency, amplitude, decay speed.
  const partials = [
    [1, 1, 7],
    [2.76, 0.32, 11],
    [5.4, 0.12, 16],
    [8.93, 0.05, 22],
  ];
  const s0 = Math.floor(start * RATE);
  const n = Math.floor(duration * RATE);
  for (let i = 0; i < n && s0 + i < out.length; i++) {
    const t = i / RATE;
    const attack = Math.min(1, t / 0.004);
    let v = 0;
    for (const [rel, amp, decay] of partials) v += amp * Math.exp(-decay * t) * Math.sin(2 * Math.PI * freq * rel * t);
    out[s0 + i] += gain * attack * v;
  }
}

function wav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  const peak = Math.max(...samples.map(Math.abs)) || 1;
  samples.forEach((s, i) => data.writeInt16LE(Math.round((s / peak) * 0.8 * 32767), i * 2));
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

const out = new Float64Array(Math.floor(0.62 * RATE));
bell(1567.98, 0, 0.5, 0.8, out); // G6
bell(2093.0, 0.085, 0.53, 1, out); // C7
mkdirSync(path.join(root, 'assets/sounds'), { recursive: true });
writeFileSync(path.join(root, 'assets/sounds/reward.wav'), wav(Array.from(out)));
console.log('assets/sounds/reward.wav');
