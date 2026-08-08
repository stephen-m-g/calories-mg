import * as Crypto from 'expo-crypto';
import { getDb } from './client';
import type { WeightLog } from '../types/models';

interface WeightLogRow {
  id: string;
  logged_at: string;
  weight_lbs: number;
}

function rowToWeightLog(row: WeightLogRow): WeightLog {
  return { id: row.id, loggedAt: row.logged_at, weightLbs: row.weight_lbs };
}

export async function createWeightLog(weightLbs: number, loggedAt = new Date().toISOString()): Promise<WeightLog> {
  const db = await getDb();
  const id = Crypto.randomUUID();
  await db.runAsync(
    'INSERT INTO weight_logs (id, logged_at, weight_lbs) VALUES (?, ?, ?)',
    id,
    loggedAt,
    weightLbs
  );
  return { id, loggedAt, weightLbs };
}

export async function getWeightLogsBetween(startIso: string, endIso: string): Promise<WeightLog[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<WeightLogRow>(
    'SELECT * FROM weight_logs WHERE logged_at >= ? AND logged_at < ? ORDER BY logged_at ASC',
    startIso,
    endIso
  );
  return rows.map(rowToWeightLog);
}

export async function getRecentWeightLogs(limit = 10): Promise<WeightLog[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<WeightLogRow>(
    'SELECT * FROM weight_logs ORDER BY logged_at DESC LIMIT ?',
    limit
  );
  return rows.map(rowToWeightLog);
}

export async function getLatestWeightLog(): Promise<WeightLog | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<WeightLogRow>('SELECT * FROM weight_logs ORDER BY logged_at DESC LIMIT 1');
  return row ? rowToWeightLog(row) : null;
}

export async function getEarliestWeightLoggedAt(): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ earliest: string | null }>(
    'SELECT MIN(logged_at) AS earliest FROM weight_logs'
  );
  return row?.earliest ?? null;
}

export async function deleteWeightLog(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM weight_logs WHERE id = ?', id);
}
