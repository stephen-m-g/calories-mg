import { getDb } from './client';
import { ensureDefaultUserSettings } from './userSettings';

export async function initDb(): Promise<void> {
  await getDb();
  await ensureDefaultUserSettings();
}

export * from './client';
export * from './foods';
export * from './foodLogs';
export * from './waterLogs';
export * from './userSettings';
export * from './backupLog';
