import { useEffect, useState } from 'react';
import { supportedChains } from '../constants/chains';
import { getSupportedActivityChain } from '../services/activityService';
import { checkChainHealth, type ChainHealthStatus } from '../services/chainHealthService';

// Runs once per page load: each chain resolves independently and updates the
// map as it comes in, so chips go from "checking" to a real status one at a
// time instead of all waiting on the slowest chain.
export function useChainHealth() {
  const [health, setHealth] = useState<Record<number, ChainHealthStatus>>({});

  useEffect(() => {
    let cancelled = false;

    for (const chain of supportedChains) {
      const config = getSupportedActivityChain(chain.id);
      if (!config) continue;

      checkChainHealth(config.apiBaseUrl).then((status) => {
        if (!cancelled) {
          setHealth((previous) => ({ ...previous, [chain.id]: status }));
        }
      });
    }

    return () => {
      cancelled = true;
    };
  }, []);

  return health;
}
