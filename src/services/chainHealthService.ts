import { fetchWithTimeout } from '../utils/fetchWithTimeout';

export type ChainHealthStatus = 'ok' | 'slow' | 'down';

const SLOW_THRESHOLD_MS = 3000;
const HEALTH_CHECK_TIMEOUT_MS = 6000;

// Blockscout's /stats endpoint is a cheap, address-independent way to tell
// whether a chain's public API is actually responsive right now — the same
// kind of check that caught Base returning slow 500s for every address.
export async function checkChainHealth(apiBaseUrl: string): Promise<ChainHealthStatus> {
  const startedAt = performance.now();

  try {
    const response = await fetchWithTimeout(`${apiBaseUrl}/stats`, HEALTH_CHECK_TIMEOUT_MS);

    if (!response.ok) {
      return 'down';
    }

    return performance.now() - startedAt > SLOW_THRESHOLD_MS ? 'slow' : 'ok';
  } catch {
    return 'down';
  }
}
