import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system/legacy';
import { File, Paths } from 'expo-file-system';
import { getDb, createBackupLogEntry } from '../db';

/**
 * Manual backup: serialize the local SQLite database and PUT it to an Azure Blob Storage SAS URL.
 *
 * Scope is deliberately database-only, not photos — the DB is a few MB and captures everything
 * that actually matters (logs, weights, settings, cached foods); photos are meaningfully larger
 * and would need a broader container-level SAS instead of a single-blob one. See PROJECT_PLAN.md §8.
 *
 * The SAS URL is a live write credential to a real paid resource — closer to the WHOOP OAuth
 * tokens than to the free-tier AI API keys, so it lives in expo-secure-store, never in .env or
 * SQLite (which is destined for this very backup).
 */

const SAS_URL_KEY = 'azure_backup_sas_url';

// Recent enough for full block-blob semantics; SAS auth doesn't require this to match the
// account's own version, but Azure recommends sending it to pin request behavior.
const BLOB_API_VERSION = '2021-08-06';

export async function getBackupSasUrl(): Promise<string | null> {
  return SecureStore.getItemAsync(SAS_URL_KEY);
}

export async function setBackupSasUrl(url: string): Promise<void> {
  await SecureStore.setItemAsync(SAS_URL_KEY, url.trim());
}

export async function clearBackupSasUrl(): Promise<void> {
  await SecureStore.deleteItemAsync(SAS_URL_KEY);
}

export interface BackupResult {
  success: boolean;
  message: string;
}

export async function runBackup(): Promise<BackupResult> {
  const sasUrl = await getBackupSasUrl();
  if (!sasUrl) {
    return { success: false, message: 'No backup destination configured.' };
  }

  const tempFile = new File(Paths.cache, `backup-${Date.now()}.db`);
  try {
    const db = await getDb();
    // sqlite3_serialize rather than copying the .db file directly — safe under WAL mode, where
    // recently committed data can live in a separate -wal file the raw file alone wouldn't reflect.
    const bytes = await db.serializeAsync();
    tempFile.write(bytes);

    // uploadAsync's BINARY_CONTENT mode sends the file's raw bytes as the request body, matching
    // what Azure's Put Blob expects — sidesteps any question of how fetch would encode a binary body.
    const response = await FileSystem.uploadAsync(sasUrl, tempFile.uri, {
      httpMethod: 'PUT',
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: {
        'x-ms-blob-type': 'BlockBlob',
        'x-ms-version': BLOB_API_VERSION,
        'Content-Type': 'application/x-sqlite3',
      },
    });

    // Azure returns 201 Created for a successful Put Blob; the SAS URL itself doubles as the
    // location the file was written to, so it's what gets recorded rather than a derived path.
    const success = response.status === 201;
    await createBackupLogEntry(sasUrl, success ? 'success' : 'failed');
    return success
      ? { success: true, message: `Backed up ${(bytes.byteLength / 1024).toFixed(0)} KB.` }
      : { success: false, message: `Azure rejected the upload (${response.status}).` };
  } catch (err) {
    await createBackupLogEntry(sasUrl, 'failed');
    return {
      success: false,
      message: err instanceof Error ? err.message : 'Backup failed for an unknown reason.',
    };
  } finally {
    if (tempFile.exists) tempFile.delete();
  }
}
