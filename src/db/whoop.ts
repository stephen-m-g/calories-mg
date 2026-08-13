import { getDb } from './client';
import type { WhoopConnection } from '../types/models';

interface WhoopConnectionRow {
  id: number;
  connected: number;
  whoop_user_id: string | null;
  token_expires_at: string | null;
  last_synced_at: string | null;
}

const DISCONNECTED: WhoopConnection = {
  id: 1,
  connected: false,
  whoopUserId: null,
  tokenExpiresAt: null,
  lastSyncedAt: null,
};

/**
 * Connection state only — access and refresh tokens live in expo-secure-store, never here.
 * They're live account credentials, and SQLite is plain-text on disk (and lands in backups).
 */
export async function getWhoopConnection(): Promise<WhoopConnection> {
  const db = await getDb();
  const row = await db.getFirstAsync<WhoopConnectionRow>('SELECT * FROM whoop_connection WHERE id = 1');
  if (!row) return DISCONNECTED;
  return {
    id: row.id,
    connected: row.connected === 1,
    whoopUserId: row.whoop_user_id,
    tokenExpiresAt: row.token_expires_at,
    lastSyncedAt: row.last_synced_at,
  };
}

export async function setWhoopConnected(params: {
  whoopUserId: string | null;
  tokenExpiresAt: string | null;
}): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO whoop_connection (id, connected, whoop_user_id, token_expires_at, last_synced_at)
     VALUES (1, 1, ?, ?, NULL)
     ON CONFLICT(id) DO UPDATE SET connected = 1, whoop_user_id = ?, token_expires_at = ?`,
    params.whoopUserId,
    params.tokenExpiresAt,
    params.whoopUserId,
    params.tokenExpiresAt
  );
}

export async function setWhoopDisconnected(): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO whoop_connection (id, connected, whoop_user_id, token_expires_at, last_synced_at)
     VALUES (1, 0, NULL, NULL, NULL)
     ON CONFLICT(id) DO UPDATE SET connected = 0, whoop_user_id = NULL, token_expires_at = NULL`
  );
}

export async function markWhoopSynced(when = new Date().toISOString()): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE whoop_connection SET last_synced_at = ? WHERE id = 1', when);
}

export async function updateWhoopTokenExpiry(tokenExpiresAt: string | null): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE whoop_connection SET token_expires_at = ? WHERE id = 1', tokenExpiresAt);
}

/**
 * Stores a cycle's energy expenditure, keyed by the WHOOP cycle id so repeated polls of the
 * same in-progress cycle overwrite rather than accumulate — the value climbs through the day.
 */
export async function upsertWhoopCycle(params: {
  id: string;
  cycleDate: string;
  kilojoules: number;
}): Promise<void> {
  const db = await getDb();
  const caloriesBurned = params.kilojoules / 4.184;
  await db.runAsync(
    `INSERT INTO whoop_cycle_cache (id, cycle_date, kilojoules, calories_burned, fetched_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       cycle_date = excluded.cycle_date,
       kilojoules = excluded.kilojoules,
       calories_burned = excluded.calories_burned,
       fetched_at = excluded.fetched_at`,
    params.id,
    params.cycleDate,
    params.kilojoules,
    caloriesBurned,
    new Date().toISOString()
  );
}

/** A day's total burn. Lets the Today screen show a real number while offline.
 *
 * Summed rather than "most recently fetched": WHOOP cycles are wake-to-wake, so an unusual
 * sleep pattern (a late nap, an all-nighter) can start two cycles on the same calendar day.
 * Taking one of them would silently under-report that day's burn. */
export async function getWhoopBurnForDate(cycleDate: string): Promise<number | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ total: number | null }>(
    'SELECT SUM(calories_burned) AS total FROM whoop_cycle_cache WHERE cycle_date = ?',
    cycleDate
  );
  return row?.total ?? null;
}

/** Per-day burn totals across a range, keyed by YYYY-MM-DD. Days with no cycle are absent
 * rather than zero — no data and a zero-burn day mean very different things to a chart. */
export async function getWhoopBurnByDate(
  startDate: string,
  endDate: string
): Promise<Map<string, number>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ cycle_date: string; total: number }>(
    `SELECT cycle_date, SUM(calories_burned) AS total
     FROM whoop_cycle_cache
     WHERE cycle_date >= ? AND cycle_date <= ?
     GROUP BY cycle_date
     ORDER BY cycle_date ASC`,
    startDate,
    endDate
  );
  return new Map(rows.map((r) => [r.cycle_date, r.total]));
}
