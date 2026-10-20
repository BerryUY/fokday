import * as Crypto from 'expo-crypto';

/** Stable unique identifiers for every row; they survive backups and restores. */
export function newId(): string {
  return Crypto.randomUUID();
}

export async function sha256(text: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, text);
}
