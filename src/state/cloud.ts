import { useCallback, useEffect, useState } from 'react';
import type { CloudConfig } from '@/backup/api';
import { getCloudConfig, useSyncState } from '@/backup/service';

/** The cloud profile connection (null when this phone has none). Features like the AI photo need it. */
export function useCloudConfig(): { config: CloudConfig | null; loading: boolean; reload: () => void } {
  const sync = useSyncState();
  const [config, setConfig] = useState<CloudConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(() => {
    getCloudConfig()
      .then(setConfig)
      .catch(() => setConfig(null))
      .finally(() => setLoading(false));
  }, []);
  useEffect(reload, [reload, sync.configured]);
  return { config, loading, reload };
}
