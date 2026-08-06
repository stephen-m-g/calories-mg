import * as Crypto from 'expo-crypto';
import { getDb } from './client';
import type { WaterLog } from '../types/models';

interface WaterLogRow {
  id: string;
  logged_at: string;
  amount_ml: number;
}

function rowToWaterLog(row: WaterLogRow): WaterLog {
  return { id: row.id, loggedAt: row.logged_at, amountMl: row.amount_ml };
}

export async function createWaterLog(amountMl: number, loggedAt = new Date().toISOString()): Promise<WaterLog> {
  const db = await getDb();
  const id = Crypto.randomUUID();
  await db.runAsync('INSERT INTO water_logs (id, logged_at, amount_ml) VALUES (?, ?, ?)', id, loggedAt, amountMl);
  return { id, loggedAt, amountMl };
}

export async function getWaterLogsBetween(startIso: string, endIso: string): Promise<WaterLog[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<WaterLogRow>(
    'SELECT * FROM water_logs WHERE logged_at >= ? AND logged_at < ? ORDER BY logged_at ASC',
    startIso,
    endIso
  );
  return rows.map(rowToWaterLog);
}

export async function deleteWaterLog(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM water_logs WHERE id = ?', id);
}
