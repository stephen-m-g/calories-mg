import * as Crypto from 'expo-crypto';
import { getDb } from './client';
import type { BackupLogEntry } from '../types/models';

interface BackupLogRow {
  id: string;
  backed_up_at: string;
  blob_path: string;
  status: string;
}

function rowToBackupLog(row: BackupLogRow): BackupLogEntry {
  return {
    id: row.id,
    backedUpAt: row.backed_up_at,
    blobPath: row.blob_path,
    status: row.status as BackupLogEntry['status'],
  };
}

export async function createBackupLogEntry(
  blobPath: string,
  status: BackupLogEntry['status']
): Promise<BackupLogEntry> {
  const db = await getDb();
  const id = Crypto.randomUUID();
  const backedUpAt = new Date().toISOString();
  await db.runAsync(
    'INSERT INTO backup_log (id, backed_up_at, blob_path, status) VALUES (?, ?, ?, ?)',
    id,
    backedUpAt,
    blobPath,
    status
  );
  return { id, backedUpAt, blobPath, status };
}

export async function getRecentBackupLogs(limit = 20): Promise<BackupLogEntry[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<BackupLogRow>(
    'SELECT * FROM backup_log ORDER BY backed_up_at DESC LIMIT ?',
    limit
  );
  return rows.map(rowToBackupLog);
}
