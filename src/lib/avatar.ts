import { File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';
import { setSetting } from '@/data/settings';
import type { Db } from '@/db/types';

export const AVATAR_KEY = 'profile.avatar';

/**
 * Lets the person pick a square photo and keeps a copy inside the app's storage (the gallery
 * original can be deleted). Returns false when they cancel.
 */
export async function pickAvatar(db: Db): Promise<boolean> {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.6 });
  if (result.canceled || !result.assets?.[0]) return false;
  let uri = result.assets[0].uri;
  if (Platform.OS !== 'web') {
    const dest = new File(Paths.document, `avatar-${Date.now()}.jpg`);
    new File(uri).copy(dest);
    uri = dest.uri;
  }
  await setSetting(db, AVATAR_KEY, uri);
  return true;
}
