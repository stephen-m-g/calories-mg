import {
  getWhoopBurnForDate,
  markWhoopSynced,
  setWhoopConnected,
  upsertWhoopCycle,
} from '../db';
import { dayBoundsIso, isoToLocalYmd, shiftYmd, todayYmd } from '../utils/date';
import { clearWhoopTokens, getValidAccessToken } from './whoopAuth';

const BASE_URL = 'https://api.prod.whoop.com/developer';

/** kJ -> kcal. WHOOP reports energy expenditure in kilojoules only. */
const KJ_PER_KCAL = 4.184;

/**
 * How far back each sync reaches. Cycles are re-fetched rather than assumed settled: a cycle's
 * kilojoule total keeps climbing until the cycle closes, so the value read while a day was still
 * in progress is not its final one. Re-pulling a week's worth lets those days converge on their
 * true totals, and backfills any day the app simply wasn't opened.
 */
const SYNC_WINDOW_DAYS = 7;

/** WHOOP caps `limit` at 25. A week of cycles is well under that even with odd sleep patterns. */
const CYCLE_FETCH_LIMIT = 25;

interface WhoopCycleRecord {
  id: number;
  user_id: number;
  /** Start of the physiological day (wake), not midnight — see attributeToDate below. */
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
  /** The calendar day this figure belongs to. Always the day that was asked for. */
  cycleDate: string;
  /** True when the value came from cache rather than a live fetch (offline, or a past day). */
  fromCache: boolean;
}

/** A cycle spanning more days than this is treated as malformed rather than walked indefinitely. */
const MAX_CYCLE_SPAN_DAYS = 14;

/**
 * The calendar day a cycle counts toward: the one it spends the most of its length inside.
 *
 * WHOOP's day is physiological (wake to wake), not midnight to midnight, so a cycle always
 * straddles a boundary and some rule has to pick a side. Using the *start* date alone looked
 * right and wasn't: WHOOP only closes a cycle once it processes sleep, so a night it doesn't
 * record leaves the cycle open and still climbing. Pinned to its start, that growing total stays
 * welded to the day it began — yesterday keeps rising while today never gets a figure at all.
 *
 * Majority overlap fixes that without special-casing anything. An ordinary cycle (wake Tue to
 * wake Wed) puts ~17 of its 24 hours in Tuesday and lands there, same as before. One that runs
 * long crosses over on its own once most of it sits in the new day, so today starts reporting.
 * An open cycle is measured up to now, which is what makes the number move through the day.
 *
 * It also settles rather than oscillating: the day holding the majority only grows its share as
 * a cycle extends, so a value that has moved to a day stays there once the cycle closes.
 */
function attributeToDate(cycle: WhoopCycleRecord, now = new Date()): string {
  const start = new Date(cycle.start);
  // An open cycle has no end yet; it's still accruing, so it counts up to the present moment.
  const end = cycle.end ? new Date(cycle.end) : now;
  if (!Number.isFinite(start.getTime())) return isoToLocalYmd(cycle.start);
  if (!Number.isFinite(end.getTime()) || end <= start) return isoToLocalYmd(cycle.start);

  const lastDay = isoToLocalYmd(end.toISOString());
  let day = isoToLocalYmd(cycle.start);
  let bestDay = day;
  let bestOverlapMs = -1;

  for (let i = 0; i <= MAX_CYCLE_SPAN_DAYS; i += 1) {
    const bounds = dayBoundsIso(day);
    const overlapMs =
      Math.min(end.getTime(), Date.parse(bounds.endIso)) -
      Math.max(start.getTime(), Date.parse(bounds.startIso));
    if (overlapMs > bestOverlapMs) {
      bestOverlapMs = overlapMs;
      bestDay = day;
    }
    if (day === lastDay) break;
    day = shiftYmd(day, 1);
  }

  return bestDay;
}

/**
 * Pulls recent cycles and caches each against the day it belongs to.
 *
 * Polled (on Today-screen focus and manual refresh) rather than pushed — receiving WHOOP's
 * webhooks would need a public HTTPS endpoint, which a no-backend app doesn't have.
 *
 * Returns the number of cycles stored, or null when there's no usable connection.
 */
export async function syncRecentCycles(): Promise<number | null> {
  const accessToken = await getValidAccessToken();
  if (!accessToken) return null;

  // Local midnight of the window's first day, so that day's cycle is included whatever time
  // of day the sync happens to run at.
  const params = new URLSearchParams({
    start: dayBoundsIso(shiftYmd(todayYmd(), -SYNC_WINDOW_DAYS)).startIso,
    limit: String(CYCLE_FETCH_LIMIT),
  });
  const response = await fetch(`${BASE_URL}/v2/cycle?${params.toString()}`, {
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
  const cycles = data.records ?? [];

  const now = new Date();
  let stored = 0;
  for (const cycle of cycles) {
    // Gate on the number actually being there rather than on `score_state`. A cycle in progress
    // can report PENDING_SCORE while already carrying a real running kilojoule total, and
    // requiring SCORED threw that away — which on its own is enough to leave the current day
    // blank. What must never be stored is a missing value dressed up as zero burn, and the type
    // check is what prevents that.
    if (typeof cycle.score?.kilojoule !== 'number') continue;
    await upsertWhoopCycle({
      id: String(cycle.id),
      cycleDate: attributeToDate(cycle, now),
      kilojoules: cycle.score.kilojoule,
    });
    stored += 1;
  }

  await markWhoopSynced();
  // The user id isn't in the token response, so capture it the first time a cycle arrives.
  if (cycles[0]) {
    await setWhoopConnected({ whoopUserId: String(cycles[0].user_id), tokenExpiresAt: null });
  }

  return stored;
}

/**
 * Burned calories for a specific day.
 *
 * The requested day is always answered from the cache, never straight from whatever cycle the
 * API happened to return — that is what previously let an in-progress cycle's total be shown
 * against the wrong calendar day. A live sync runs first when the day is recent enough to still
 * be changing, but it only refreshes the cache; it never decides the answer.
 *
 * Never throws for network reasons — the Today screen must stay usable offline.
 */
export async function getBurnedCalories(ymd = todayYmd()): Promise<BurnedCalories | null> {
  // Days inside the sync window can still move (an open cycle, or one that closed since the last
  // poll). Anything older is settled, so it's served from cache without a network round trip.
  const withinSyncWindow = ymd >= shiftYmd(todayYmd(), -SYNC_WINDOW_DAYS);

  let synced = false;
  if (withinSyncWindow) {
    try {
      synced = (await syncRecentCycles()) !== null;
    } catch {
      // Fall through to whatever the cache already holds.
    }
  }

  const caloriesBurned = await getWhoopBurnForDate(ymd);
  if (caloriesBurned == null) return null;
  return { caloriesBurned, cycleDate: ymd, fromCache: !synced };
}

/** Kilojoules to calories, for callers reading raw cycle figures. */
export function kilojoulesToCalories(kilojoules: number): number {
  return kilojoules / KJ_PER_KCAL;
}
