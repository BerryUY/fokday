import { generateKeyPairSync, sign } from 'node:crypto';
import { createAdRewardVerifier } from '../supabase/functions/momentum/adReward';

/** Signs like AdMob: ECDSA P-256 over the query before "&signature=", DER, base64url. */
describe('AdMob rewarded-video verification', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const base64 = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
  const query = 'ad_network=5450213213286189855&ad_unit=1234&custom_data=photo&reward_amount=1&reward_item=foto&timestamp=1730000000000&transaction_id=abc123&user_id=11111111-1111-4111-8111-111111111111';
  const signed = (q: string, keyId = '42') => `${q}&signature=${sign('sha256', Buffer.from(q), privateKey).toString('base64url')}&key_id=${keyId}`;

  it('accepts a callback signed by a published key', async () => {
    const verify = createAdRewardVerifier(async () => [{ keyId: 42, base64 }]);
    expect(await verify(signed(query))).toBe(true);
  });

  it('rejects tampered data, unknown keys and missing signatures', async () => {
    let fetches = 0;
    const verify = createAdRewardVerifier(async () => {
      fetches++;
      return [{ keyId: 42, base64 }];
    });
    const good = signed(query);
    expect(await verify(good.replace('user_id=1111', 'user_id=2222'))).toBe(false);
    expect(await verify(signed(query, '7'))).toBe(false);
    expect(fetches).toBe(2); // an unknown key id refreshes the key list once
    expect(await verify(query)).toBe(false);
    expect(await verify(good.replace(/signature=[^&]+/, 'signature=AAAA'))).toBe(false);
  });
});
