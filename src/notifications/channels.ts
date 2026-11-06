/**
 * Android channels, one per kind of message, so people can silence one in the system settings without
 * losing the rest. A channel's sound and vibration are fixed when it's first created, which is why
 * these carry a new id instead of reusing the old `recordatorios` and `racha` ones.
 */
export const CHANNELS = {
  streak: 'foki_racha',
  meals: 'foki_comidas',
  water: 'foki_agua',
  workout: 'foki_entreno',
  other: 'foki_avisos',
} as const;

export type ChannelKey = keyof typeof CHANNELS;
