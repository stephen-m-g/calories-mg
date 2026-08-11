import {
  getWhoopCycleForDate,
  markWhoopSynced,
  setWhoopConnected,
  upsertWhoopCycle,
} from '../db';
import { isoToLocalYmd, todayYmd } from '../utils/date';
import { clearWhoopTokens, getValidAccessToken } from './whoopAuth';

const BASE_URL = 'https://api.prod.whoop.com/developer';

/** kJ -> kcal. WHOOP reports energy expenditure in kilojoules only. */
const KJ_PER_KCAL = 4.184;

interface WhoopCycleRecord {
  id: number;
  user_id: number;
  start: string;
  end: string | null;
  /** Only 'SCORED' carries a usable score; a cycle can also be pending or unscorable. */
  score_state: string;
  score?: { strain?: number; kilojoule?: number } | null;
}

interface WhoopCycleResponse {
  records?: WhoopCycleRecord[];
}

export interface BurnedCalories {
  caloriesBurned: number;
  cycleDate: string;
  /** True when the value came from cache rather than a live fetch (offline, or not yet synced). */
  fromCache: boolean;
}

/**
 * Fetches the current physiological cycle and caches its energy expenditure.
 *
 * WHOOP is a daily-cadence source, not a stream: the current cycle's `kilojoule` is a running
 * total that updates periodically and only settles once the cycle closes. So this is polled
 * (on Today-screen focus and manual refresh) rather than pushed — receiving WHOOP's webhooks
 * would need a public HTTPS endpoint, which a no-backend app doesn't have.
 */
export async function syncLatestCycle(): Promise<BurnedCalories | null> {
  const accessToken = await getValidAccessToken();
  if (!accessToken) return null;

  // Default ordering is already start-time descending, so one record is the current cycle.
  const response = await fetch(`${BASE_URL}/v2/cycle?limit=1`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (response.status === 401) {
    // The token was rejected despite being unexpired — treat access as revoked rather than
    // retrying forever, so the UI can prompt a reconnect.
    await clearWhoopTokens();
    return null;
  }
  if (!response.ok) {
    throw new Error(`WHOOP sync failed (${response.status})`);
  }

  const data: WhoopCycleResponse = await response.json();
  const cycle = data.records?.[0];
  if (!cycle) return null;

  // A cycle that hasn't been scored yet has no kilojoule value; showing 0 burned would be worse
  // than showing the last known figure, so leave the cache untouched and fall back to it.
  if (cycle.score_state !== 'SCORED' || typeof cycle.score?.kilojoule !== 'number') {
    const cycleDate = isoToLocalYmd(cycle.start);
    const cached = await getWhoopCycleForDate(cycleDate);
    return cached
      ? { caloriesBurned: cached.caloriesBurned, cycleDate, fromCache: true }
      : null;
  }

  const cycleDate = isoToLocalYmd(cycle.start);
  await upsertWhoopCycle({
    id: String(cycle.id),
    cycleDate,
    kilojoules: cycle.score.kilojoule,
  });
  await markWhoopSynced();
  // The user id isn't in the token response, so capture it the first time a cycle arrives.
  await setWhoopConnected({
    whoopUserId: String(cycle.user_id),
    tokenExpiresAt: null,
  });

  return {
    caloriesBurned: cycle.score.kilojoule / KJ_PER_KCAL,
    cycleDate,
    fromCache: false,
  };
}

/**
 * Burned calories for a day, preferring a live sync but falling back to the last cached value.
 * Never throws for network reasons — the Today screen must stay usable offline.
 */
export async function getBurnedCalories(ymd = todayYmd()): Promise<BurnedCalories | null> {
  if (ymd === todayYmd()) {
    try {
      const fresh = await syncLatestCycle();
      if (fresh) return fresh;
    } catch {
      // Fall through to cache below.
    }
  }

  const cached = await getWhoopCycleForDate(ymd);
  return cached
    ? { caloriesBurned: cached.caloriesBurned, cycleDate: ymd, fromCache: true }
    : null;
}
