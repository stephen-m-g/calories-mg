import { getDb } from './client';
import { ensureDefaultUserSettings } from './userSettings';

export async function initDb(): Promise<void> {
  await getDb();
  await ensureDefaultUserSettings();
}

export * from './client';
export * from './foods';
export * from './foodLogs';
export * from './recipes';
export * from './waterLogs';
export * from './weightLogs';
export * from './userSettings';
export * from './whoop';
export * from './backupLog';
