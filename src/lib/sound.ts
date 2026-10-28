import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

/**
 * The reward "clink" (synthesized by scripts/generate-sounds.mjs). Short, mixes with music
 * instead of pausing it, respects the phone's silent mode, and can be turned off in Ajustes.
 */

let player: AudioPlayer | null = null;
let enabled = true;

export function setSoundsEnabled(on: boolean): void {
  enabled = on;
}

export async function playReward(): Promise<void> {
  if (!enabled) return;
  try {
    if (!player) {
      await setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers' });
      player = createAudioPlayer(require('../../assets/sounds/reward.wav'));
      player.volume = 0.7;
    }
    await player.seekTo(0);
    player.play();
  } catch {
    // A sound is a nice extra; never let it break the action that earned it.
  }
}
