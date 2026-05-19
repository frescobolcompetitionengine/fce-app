import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'fce.sqlite');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const IMAGE_DIR = path.join(UPLOAD_DIR, 'images');
const ANALYSIS_REPORTS_DIR = path.join(UPLOAD_DIR, 'analysis-reports');
const SYSTEM_BACKUP_DIR = path.join(DATA_DIR, 'system-backups');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

if (!fs.existsSync(IMAGE_DIR)) {
  fs.mkdirSync(IMAGE_DIR, { recursive: true });
}

if (!fs.existsSync(ANALYSIS_REPORTS_DIR)) {
  fs.mkdirSync(ANALYSIS_REPORTS_DIR, { recursive: true });
}

if (!fs.existsSync(SYSTEM_BACKUP_DIR)) {
  fs.mkdirSync(SYSTEM_BACKUP_DIR, { recursive: true });
}

const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS records (
    id TEXT PRIMARY KEY,
    collection TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    sort_at TEXT NOT NULL,
    owner_user_id TEXT,
    owner_email TEXT,
    data TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_records_collection_sort
    ON records(collection, sort_at DESC, updated_at DESC);

  CREATE INDEX IF NOT EXISTS idx_records_collection_owner
    ON records(collection, owner_user_id);

  CREATE TABLE IF NOT EXISTS uploaded_files (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    original_name TEXT,
    stored_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size INTEGER NOT NULL,
    storage_path TEXT NOT NULL,
    url_path TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_uploaded_files_created_at
    ON uploaded_files(created_at DESC, updated_at DESC);

  CREATE TABLE IF NOT EXISTS user_backups (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    reason TEXT NOT NULL,
    source TEXT NOT NULL,
    snapshot_hash TEXT NOT NULL UNIQUE,
    user_count INTEGER NOT NULL,
    users_json TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_user_backups_created_at
    ON user_backups(created_at DESC, updated_at DESC);

  CREATE TABLE IF NOT EXISTS system_backups (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    reason TEXT NOT NULL,
    source TEXT NOT NULL,
    snapshot_hash TEXT NOT NULL UNIQUE,
    record_count INTEGER NOT NULL,
    upload_count INTEGER NOT NULL,
    user_backup_count INTEGER NOT NULL,
    backup_dir TEXT NOT NULL,
    db_backup_path TEXT NOT NULL,
    manifest_json TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_system_backups_created_at
    ON system_backups(created_at DESC, updated_at DESC);
`);

function normalizeOrder(order = '-updated_at') {
  return String(order || '').startsWith('-') ? 'DESC' : 'ASC';
}

function normalizeFilterValue(value) {
  if (value === undefined || value === null || value === '') return null;
  return String(value);
}

function projectAnalysisRecord(data = {}, row = {}) {
  const analysis = data.analysis_data || data.analysisData || {};
  return {
    id: row.id || data.id,
    created_at: row.created_at || data.created_at,
    updated_at: row.updated_at || data.updated_at,
    sort_at: row.sort_at || data.sort_at || data.updated_at || data.created_at,
    owner_user_id: row.owner_user_id || data.owner_user_id || null,
    owner_email: row.owner_email || data.owner_email || null,
    match_key: data.match_key || data.matchKey || analysis.matchKey || '',
    file_name: data.file_name || data.fileName || analysis.fileName || analysis.sourceFileName || '',
    kind: data.kind || analysis.kind || 'unknown',
    display_date: data.display_date || data.displayDate || analysis.displayDate || analysis.date || '',
    display_left_name: data.display_left_name || data.displayLeftName || analysis.displayLeftName || '',
    display_right_name: data.display_right_name || data.displayRightName || analysis.displayRightName || '',
    display_score: data.display_score ?? data.displayScore ?? analysis.displayScore ?? analysis.totalPoints ?? 0,
    source_kind: data.source_kind || data.sourceKind || analysis.primaryKind || 'unknown',
    raw_text_url: data.raw_text_url || data.rawTextUrl || analysis.rawTextUrl || '',
    raw_text_size: data.raw_text_size ?? data.rawTextSize ?? analysis.rawTextSize ?? 0,
  };
}

function parseRecord(row, { compact = false } = {}) {
  const data = JSON.parse(row.data || '{}');
  if (compact && row.collection === 'analysis_reports') {
    return projectAnalysisRecord(data, row);
  }
  return {
    id: row.id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    sort_at: row.sort_at,
    owner_user_id: row.owner_user_id || null,
    owner_email: row.owner_email || null,
    ...data,
  };
}

function parseUploadedFile(row) {
  if (!row) return null;
  return {
    id: row.id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    original_name: row.original_name || null,
    stored_name: row.stored_name,
    mime_type: row.mime_type,
    size: row.size,
    storage_path: row.storage_path,
    url_path: row.url_path,
    file_url: row.url_path,
  };
}

function safeParseJson(text, fallback) {
  try {
    const value = JSON.parse(text || '');
    return value === undefined || value === null ? fallback : value;
  } catch {
    return fallback;
  }
}

function collectCollectionRecords(collection, limit = 5000) {
  return listRecords(collection, { order: '-updated_at', limit });
}

function buildBackupSnapshot({
  users = null,
  match_history = null,
  game_sessions = null,
  settings = null,
} = {}) {
  return {
    users: Array.isArray(users) ? users : collectCollectionRecords('users', 5000),
    match_history: Array.isArray(match_history) ? match_history : collectCollectionRecords('match_history', 5000),
    game_sessions: Array.isArray(game_sessions) ? game_sessions : collectCollectionRecords('game_sessions', 5000),
    settings: Array.isArray(settings) ? settings : collectCollectionRecords('settings', 5000),
  };
}

function normalizeBackupSnapshot(snapshot) {
  if (Array.isArray(snapshot)) {
    return {
      users: snapshot,
      match_history: [],
      game_sessions: [],
    };
  }

  return {
    users: Array.isArray(snapshot?.users) ? snapshot.users : [],
    match_history: Array.isArray(snapshot?.match_history) ? snapshot.match_history : [],
    game_sessions: Array.isArray(snapshot?.game_sessions) ? snapshot.game_sessions : [],
    settings: Array.isArray(snapshot?.settings) ? snapshot.settings : [],
  };
}

function serializeBackupSnapshot(snapshot = {}) {
  return JSON.stringify(normalizeBackupSnapshot(snapshot));
}

function hashBackupSnapshot(snapshot = {}) {
  return createHash('sha256').update(serializeBackupSnapshot(snapshot)).digest('hex');
}

function parseUserBackup(row) {
  if (!row) return null;
  const snapshot = normalizeBackupSnapshot(safeParseJson(row.users_json || '[]', []));
  return {
    id: row.id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    reason: row.reason,
    source: row.source,
    snapshot_hash: row.snapshot_hash,
    user_count: row.user_count,
    game_count: snapshot.match_history.length + snapshot.game_sessions.length,
    settings_count: snapshot.settings.length,
    users: snapshot.users,
    match_history: snapshot.match_history,
    game_sessions: snapshot.game_sessions,
    settings: snapshot.settings,
    snapshot,
  };
}

function ensureDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function removeDirectory(dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

function countFilesAndBytes(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return { fileCount: 0, byteCount: 0 };
  }

  let fileCount = 0;
  let byteCount = 0;
  const stack = [dirPath];

  while (stack.length > 0) {
    const currentDir = stack.pop();
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        stack.push(entryPath);
        continue;
      }

      if (!entry.isFile()) continue;
      fileCount += 1;
      byteCount += fs.statSync(entryPath).size;
    }
  }

  return { fileCount, byteCount };
}

function hashFile(filePath) {
  if (!fs.existsSync(filePath)) return '';
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function getTableCount(database, tableName) {
  return Number(database.prepare(`SELECT COUNT(*) AS count FROM ${tableName}`).get()?.count || 0);
}

function countRecordsByCollection() {
  return db.prepare(`
    SELECT collection, COUNT(*) AS count
    FROM records
    GROUP BY collection
    ORDER BY collection ASC
  `).all();
}

function safeCopyDirectory(sourceDir, targetDir) {
  if (!fs.existsSync(sourceDir)) {
    ensureDirectory(targetDir);
    return false;
  }

  ensureDirectory(path.dirname(targetDir));
  removeDirectory(targetDir);
  fs.cpSync(sourceDir, targetDir, { recursive: true, force: true });
  return true;
}

function copyRelatedDbFiles(sourcePath, targetPath) {
  const relatedFiles = [
    [sourcePath, targetPath],
    [`${sourcePath}-wal`, `${targetPath}-wal`],
    [`${sourcePath}-shm`, `${targetPath}-shm`],
    [`${sourcePath}-journal`, `${targetPath}-journal`],
  ];

  for (const [sourceFile, targetFile] of relatedFiles) {
    if (!fs.existsSync(sourceFile)) continue;
    fs.copyFileSync(sourceFile, targetFile);
  }
}

function copyDirectoryContents(sourceDir, targetDir) {
  removeDirectory(targetDir);
  ensureDirectory(targetDir);
  if (!fs.existsSync(sourceDir)) {
    return false;
  }
  fs.cpSync(sourceDir, targetDir, { recursive: true, force: true });
  return true;
}

function parseSystemBackup(row) {
  if (!row) return null;
  return {
    id: row.id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    reason: row.reason,
    source: row.source,
    snapshot_hash: row.snapshot_hash,
    record_count: row.record_count,
    upload_count: row.upload_count,
    user_backup_count: row.user_backup_count,
    backup_dir: row.backup_dir,
    db_backup_path: row.db_backup_path,
    manifest: safeParseJson(row.manifest_json || '{}', {}),
  };
}

function buildSystemBackupManifest({
  id,
  createdAt,
  reason,
  source,
  recordCount,
  uploadCount,
  userBackupCount,
  dbSize,
  uploadFileCount,
  uploadTotalBytes,
  backupDir,
  dbBackupPath,
}) {
  return {
    id,
    created_at: createdAt,
    reason,
    source,
    record_count: recordCount,
    upload_count: uploadCount,
    user_backup_count: userBackupCount,
    db_size: dbSize,
    upload_file_count: uploadFileCount,
    upload_total_bytes: uploadTotalBytes,
    backup_dir: backupDir,
    db_backup_path: dbBackupPath,
  };
}

function serializeSystemBackupManifest(manifest) {
  return JSON.stringify(manifest);
}

function hashSystemBackupManifest(manifest) {
  return createHash('sha256').update(serializeSystemBackupManifest(manifest)).digest('hex');
}

function writeRowsToTable(connection, tableName, rows, columns, rowMapper) {
  const placeholders = columns.map(() => '?').join(', ');
  const stmt = connection.prepare(`
    INSERT INTO ${tableName} (${columns.join(', ')})
    VALUES (${placeholders})
    ON CONFLICT(id) DO UPDATE SET ${columns
      .filter((column) => column !== 'id')
      .map((column) => `${column} = excluded.${column}`)
      .join(', ')}
  `);
  for (const item of rows) {
    stmt.run(...rowMapper(item));
  }
}

function replaceTableFromRows(connection, tableName, rows, columns, rowMapper) {
  connection.prepare(`DELETE FROM ${tableName}`).run();
  if (!Array.isArray(rows) || rows.length === 0) return 0;
  writeRowsToTable(connection, tableName, rows, columns, rowMapper);
  return rows.length;
}

function exportRowsFromDatabase(connection, tableName) {
  return connection.prepare(`SELECT * FROM ${tableName} ORDER BY created_at ASC, updated_at ASC`).all();
}

export function listRecords(collection, { order = '-updated_at', limit = 500, ownerUserId = null, compact = false } = {}) {
  const direction = normalizeOrder(order);
  const safeLimit = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(5000, Number(limit))) : 500;
  const owner = normalizeFilterValue(ownerUserId);

  const stmt = owner
    ? db.prepare(`
        SELECT * FROM records
        WHERE collection = ? AND owner_user_id = ?
        ORDER BY sort_at ${direction}, updated_at ${direction}
        LIMIT ?
      `)
    : db.prepare(`
        SELECT * FROM records
        WHERE collection = ?
        ORDER BY sort_at ${direction}, updated_at ${direction}
        LIMIT ?
      `);

  const rows = owner
    ? stmt.all(collection, owner, safeLimit)
    : stmt.all(collection, safeLimit);
  return rows.map((row) => parseRecord(row, { compact }));
}

export function getRecord(collection, id) {
  const row = db.prepare('SELECT * FROM records WHERE collection = ? AND id = ? LIMIT 1').get(collection, id);
  return row ? parseRecord(row) : null;
}

export function upsertRecord(collection, id, data, meta = {}) {
  const existing = id ? getRecord(collection, id) : null;
  const now = new Date().toISOString();
  const recordId = existing?.id || id || (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const createdAt = existing?.created_at || meta.created_at || now;
  const updatedAt = now;
  const sortAt = meta.sort_at || data.played_at || data.started_at || data.updated_at || updatedAt;
  const ownerUserId = normalizeFilterValue(meta.owner_user_id ?? data.owner_user_id ?? existing?.owner_user_id);
  const ownerEmail = normalizeFilterValue(meta.owner_email ?? data.owner_email ?? existing?.owner_email);
  const payload = existing ? { ...existing, ...data, id: recordId, created_at: createdAt, updated_at: updatedAt } : { ...data, id: recordId, created_at: createdAt, updated_at: updatedAt };
  const persistedPayload = collection === 'analysis_reports'
    ? (({ raw_text, rawText, analysis_data, analysisData, ...rest }) => rest)(payload)
    : payload;

  db.prepare(`
    INSERT INTO records (id, collection, created_at, updated_at, sort_at, owner_user_id, owner_email, data)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      collection = excluded.collection,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at,
      sort_at = excluded.sort_at,
      owner_user_id = excluded.owner_user_id,
      owner_email = excluded.owner_email,
      data = excluded.data
  `).run(recordId, collection, createdAt, updatedAt, sortAt, ownerUserId, ownerEmail, JSON.stringify(persistedPayload));

  const parsed = parseRecord({
    id: recordId,
    collection,
    created_at: createdAt,
    updated_at: updatedAt,
    sort_at: sortAt,
    owner_user_id: ownerUserId,
    owner_email: ownerEmail,
    data: JSON.stringify(persistedPayload),
  });
  return collection === 'analysis_reports'
    ? projectAnalysisRecord(persistedPayload, parsed)
    : parsed;
}

export function deleteRecord(collection, id) {
  if (collection === 'analysis_reports') {
    deleteAnalysisReportRawText(id);
  }
  db.prepare('DELETE FROM records WHERE collection = ? AND id = ?').run(collection, id);
  return { id };
}

export function deleteManyRecords(collection, ids = []) {
  const stmt = db.prepare('DELETE FROM records WHERE collection = ? AND id = ?');
  const txn = db.transaction((items) => {
    for (const item of items) {
      if (collection === 'analysis_reports') {
        deleteAnalysisReportRawText(item);
      }
      stmt.run(collection, item);
    }
  });
  txn(ids);
  return ids;
}

function getAnalysisReportRawTextPath(id) {
  const safeId = encodeURIComponent(String(id || 'analysis-report'));
  return path.join(ANALYSIS_REPORTS_DIR, `${safeId}.txt`);
}

export function writeAnalysisReportRawText(id, text = '') {
  const filePath = getAnalysisReportRawTextPath(id);
  fs.writeFileSync(filePath, String(text ?? ''), 'utf8');
  return {
    id,
    storage_path: filePath,
    size: Buffer.byteLength(String(text ?? ''), 'utf8'),
    raw_text_url: `/api/uploads/analysis-reports/${encodeURIComponent(String(id || 'analysis-report'))}`,
  };
}

export function readAnalysisReportRawText(id) {
  const filePath = getAnalysisReportRawTextPath(id);
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, 'utf8');
}

export function deleteAnalysisReportRawText(id) {
  const filePath = getAnalysisReportRawTextPath(id);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
  return { id };
}

export function createUsersBackup(users = [], { reason = 'auto', source = 'usersRepository' } = {}) {
  const snapshot = buildBackupSnapshot({
    users: Array.isArray(users) && users.length > 0 ? users : null,
  });
  const now = new Date().toISOString();
  const snapshotHash = hashBackupSnapshot(snapshot);
  const existing = db.prepare('SELECT * FROM user_backups WHERE snapshot_hash = ? ORDER BY created_at DESC LIMIT 1').get(snapshotHash);

  if (existing) {
    return parseUserBackup(existing);
  }

  const backupId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  db.prepare(`
    INSERT INTO user_backups (id, created_at, updated_at, reason, source, snapshot_hash, user_count, users_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(backupId, now, now, String(reason || 'auto'), String(source || 'usersRepository'), snapshotHash, snapshot.users.length, serializeBackupSnapshot(snapshot));

  pruneUserBackups();
  return getUserBackup(backupId);
}

export function createSafetySystemBackup({ reason = 'auto', source = 'server', includeUploads = true } = {}) {
  return createSystemBackup({ reason, source, includeUploads });
}

export function listUserBackups(limit = 25) {
  const safeLimit = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(200, Number(limit))) : 25;
  const rows = db.prepare(`
    SELECT * FROM user_backups
    ORDER BY created_at DESC, updated_at DESC
    LIMIT ?
  `).all(safeLimit);
  return rows.map(parseUserBackup);
}

export function getUserBackup(id) {
  const row = db.prepare('SELECT * FROM user_backups WHERE id = ? LIMIT 1').get(id);
  return parseUserBackup(row);
}

export function restoreUsersBackup(id, { createSafetyBackup = true, reason = 'restore', source = 'usersRepository' } = {}) {
  const backup = getUserBackup(id);
  if (!backup) return null;

  const currentSnapshot = buildBackupSnapshot();
  if (createSafetyBackup && (currentSnapshot.users.length > 0 || currentSnapshot.match_history.length > 0 || currentSnapshot.game_sessions.length > 0)) {
    createSafetySystemBackup({
      reason: 'before_restore_users',
      source: 'restoreUsersBackup',
    });
  }

  const restoreCollections = [
    ['users', backup.users],
    ['match_history', backup.match_history],
    ['game_sessions', backup.game_sessions],
    ['settings', backup.settings],
  ];

  for (const [collection, items] of restoreCollections) {
    const currentItems = listRecords(collection, { order: '-updated_at', limit: 5000 });
    const currentIds = currentItems.map((item) => item.id);
    if (currentIds.length > 0) {
      deleteManyRecords(collection, currentIds);
    }

    const restoredItems = Array.isArray(items) ? items : [];
    for (const item of restoredItems) {
      upsertRecord(collection, item.id, item, item);
    }
  }

  return {
    backup,
    restoredUsers: Array.isArray(backup.users) ? backup.users : [],
    restoredCount: Array.isArray(backup.users) ? backup.users.length : 0,
    restoredMatchHistoryCount: Array.isArray(backup.match_history) ? backup.match_history.length : 0,
    restoredGameSessionCount: Array.isArray(backup.game_sessions) ? backup.game_sessions.length : 0,
    restoredSettingsCount: Array.isArray(backup.settings) ? backup.settings.length : 0,
    reason,
    source,
  };
}

export function deleteUserBackup(id) {
  const row = db.prepare('SELECT id FROM user_backups WHERE id = ? LIMIT 1').get(id);
  if (!row) return null;
  db.prepare('DELETE FROM user_backups WHERE id = ?').run(id);
  return { id };
}

export function deleteManyUserBackups(ids = []) {
  const safeIds = Array.isArray(ids) ? ids.filter(Boolean) : [];
  if (!safeIds.length) return [];
  const stmt = db.prepare('DELETE FROM user_backups WHERE id = ?');
  const txn = db.transaction((items) => {
    for (const item of items) stmt.run(item);
  });
  txn(safeIds);
  return safeIds;
}

export function pruneUserBackups(limit = 25) {
  const safeLimit = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(200, Number(limit))) : 25;
  const rows = db.prepare(`
    SELECT id
    FROM user_backups
    ORDER BY created_at DESC, updated_at DESC
    LIMIT -1 OFFSET ?
  `).all(safeLimit);

  if (!rows.length) return [];

  const stmt = db.prepare('DELETE FROM user_backups WHERE id = ?');
  const txn = db.transaction((items) => {
    for (const item of items) stmt.run(item.id);
  });
  txn(rows);
  return rows.map((row) => row.id);
}

export function createSystemBackup({ reason = 'manual', source = 'server', includeUploads = true } = {}) {
  const now = new Date().toISOString();
  const backupId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const backupDir = path.join(SYSTEM_BACKUP_DIR, backupId);
  const dbBackupPath = path.join(backupDir, 'fce.sqlite');
  const uploadsBackupDir = path.join(backupDir, 'uploads');

  ensureDirectory(backupDir);
  copyRelatedDbFiles(DB_PATH, dbBackupPath);

  const uploadsStats = countFilesAndBytes(UPLOAD_DIR);
  if (includeUploads) {
    safeCopyDirectory(UPLOAD_DIR, uploadsBackupDir);
  } else {
    ensureDirectory(uploadsBackupDir);
  }

  const recordCount = getTableCount(db, 'records');
  const uploadCount = getTableCount(db, 'uploaded_files');
  const userBackupCount = getTableCount(db, 'user_backups');
  const dbSize = fs.existsSync(dbBackupPath) ? fs.statSync(dbBackupPath).size : 0;
  const dbHash = hashFile(dbBackupPath);
  const includedUploadStats = includeUploads
    ? uploadsStats
    : { fileCount: 0, byteCount: 0 };
  const manifest = buildSystemBackupManifest({
    id: backupId,
    createdAt: now,
    reason: String(reason || 'manual'),
    source: String(source || 'server'),
    recordCount,
    uploadCount,
    userBackupCount,
    dbSize,
    uploadFileCount: includedUploadStats.fileCount,
    uploadTotalBytes: includedUploadStats.byteCount,
    backupDir,
    dbBackupPath,
  });
  const snapshotHash = hashSystemBackupManifest({
    record_count: recordCount,
    upload_count: uploadCount,
    user_backup_count: userBackupCount,
    db_size: dbSize,
    db_hash: dbHash,
    upload_file_count: uploadsStats.fileCount,
    upload_total_bytes: uploadsStats.byteCount,
  });

  const existing = db.prepare('SELECT * FROM system_backups WHERE snapshot_hash = ? ORDER BY created_at DESC LIMIT 1').get(snapshotHash);
  if (existing) {
    removeDirectory(backupDir);
    return parseSystemBackup(existing);
  }

  db.prepare(`
    INSERT INTO system_backups (
      id, created_at, updated_at, reason, source, snapshot_hash,
      record_count, upload_count, user_backup_count, backup_dir, db_backup_path, manifest_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    backupId,
    now,
    now,
    String(reason || 'manual'),
    String(source || 'server'),
    snapshotHash,
    recordCount,
    uploadCount,
    userBackupCount,
    backupDir,
    dbBackupPath,
    serializeSystemBackupManifest(manifest),
  );

  pruneSystemBackups();
  return getSystemBackup(backupId);
}

export function listSystemBackups(limit = 25) {
  const safeLimit = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(200, Number(limit))) : 25;
  const rows = db.prepare(`
    SELECT * FROM system_backups
    ORDER BY created_at DESC, updated_at DESC
    LIMIT ?
  `).all(safeLimit);
  return rows.map(parseSystemBackup);
}

export function getSystemBackup(id) {
  const row = db.prepare('SELECT * FROM system_backups WHERE id = ? LIMIT 1').get(id);
  return parseSystemBackup(row);
}

export function deleteSystemBackup(id) {
  const backup = getSystemBackup(id);
  if (!backup) return null;
  db.prepare('DELETE FROM system_backups WHERE id = ?').run(id);
  removeDirectory(backup.backup_dir);
  return { id };
}

export function deleteManySystemBackups(ids = []) {
  const safeIds = Array.isArray(ids) ? ids.filter(Boolean) : [];
  if (!safeIds.length) return [];
  const txn = db.transaction((items) => {
    for (const item of items) {
      deleteSystemBackup(item);
    }
  });
  txn(safeIds);
  return safeIds;
}

export function pruneSystemBackups(limit = 25) {
  const safeLimit = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(200, Number(limit))) : 25;
  const rows = db.prepare(`
    SELECT id, backup_dir
    FROM system_backups
    ORDER BY created_at DESC, updated_at DESC
    LIMIT -1 OFFSET ?
  `).all(safeLimit);

  if (!rows.length) return [];

  const txn = db.transaction((items) => {
    for (const item of items) {
      db.prepare('DELETE FROM system_backups WHERE id = ?').run(item.id);
      removeDirectory(item.backup_dir);
    }
  });
  txn(rows);
  return rows.map((row) => row.id);
}

export function restoreSystemBackup(id, { createSafetyBackup = true, reason = 'restore', source = 'server' } = {}) {
  const backup = getSystemBackup(id);
  if (!backup) return null;

  const backupDir = backup.backup_dir;
  const dbBackupPath = backup.db_backup_path;
  const uploadsBackupDir = path.join(backupDir, 'uploads');
  if (!fs.existsSync(dbBackupPath)) {
    return null;
  }

  if (createSafetyBackup) {
    createSafetySystemBackup({
      reason: 'before_restore_system',
      source: 'restoreSystemBackup',
    });
  }

  const sourceDb = new DatabaseSync(dbBackupPath);
  try {
    const restorePlan = [
      {
        table: 'records',
        columns: ['id', 'collection', 'created_at', 'updated_at', 'sort_at', 'owner_user_id', 'owner_email', 'data'],
        rows: exportRowsFromDatabase(sourceDb, 'records'),
        rowMapper: (row) => [
          row.id,
          row.collection,
          row.created_at,
          row.updated_at,
          row.sort_at,
          row.owner_user_id || null,
          row.owner_email || null,
          row.data,
        ],
      },
      {
        table: 'uploaded_files',
        columns: ['id', 'created_at', 'updated_at', 'original_name', 'stored_name', 'mime_type', 'size', 'storage_path', 'url_path'],
        rows: exportRowsFromDatabase(sourceDb, 'uploaded_files'),
        rowMapper: (row) => [
          row.id,
          row.created_at,
          row.updated_at,
          row.original_name || null,
          row.stored_name,
          row.mime_type,
          row.size,
          row.storage_path,
          row.url_path,
        ],
      },
      {
        table: 'user_backups',
        columns: ['id', 'created_at', 'updated_at', 'reason', 'source', 'snapshot_hash', 'user_count', 'users_json'],
        rows: exportRowsFromDatabase(sourceDb, 'user_backups'),
        rowMapper: (row) => [
          row.id,
          row.created_at,
          row.updated_at,
          row.reason,
          row.source,
          row.snapshot_hash,
          row.user_count,
          row.users_json,
        ],
      },
    ];

    const txn = db.transaction((plan) => {
      for (const step of plan) {
        replaceTableFromRows(db, step.table, step.rows, step.columns, step.rowMapper);
      }
    });
    txn(restorePlan);

    copyDirectoryContents(uploadsBackupDir, UPLOAD_DIR);
    ensureDirectory(IMAGE_DIR);
    ensureDirectory(ANALYSIS_REPORTS_DIR);

    return {
      backup,
      reason,
      source,
      restoredRecordsCount: restorePlan[0].rows.length,
      restoredUploadsCount: restorePlan[1].rows.length,
      restoredUserBackupsCount: restorePlan[2].rows.length,
      restoredUploadFiles: countFilesAndBytes(UPLOAD_DIR).fileCount,
    };
  } finally {
    sourceDb.close();
  }
}

export function createUploadedFile({
  id,
  originalName = null,
  storedName,
  mimeType,
  size,
  storagePath,
  urlPath,
}) {
  const now = new Date().toISOString();
  const fileId = id || (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  db.prepare(`
    INSERT INTO uploaded_files (id, created_at, updated_at, original_name, stored_name, mime_type, size, storage_path, url_path)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      created_at = excluded.created_at,
      updated_at = excluded.updated_at,
      original_name = excluded.original_name,
      stored_name = excluded.stored_name,
      mime_type = excluded.mime_type,
      size = excluded.size,
      storage_path = excluded.storage_path,
      url_path = excluded.url_path
  `).run(fileId, now, now, originalName, storedName, mimeType, size, storagePath, urlPath);

  return getUploadedFile(fileId);
}

export function getUploadedFile(id) {
  const row = db.prepare('SELECT * FROM uploaded_files WHERE id = ? LIMIT 1').get(id);
  return parseUploadedFile(row);
}

export function getUploadedFileByUrlPath(urlPath) {
  const row = db.prepare('SELECT * FROM uploaded_files WHERE url_path = ? LIMIT 1').get(urlPath);
  return parseUploadedFile(row);
}

export function healthCheck() {
  return {
    ok: true,
    dbPath: DB_PATH,
    collections: db.prepare('SELECT collection, COUNT(*) AS count FROM records GROUP BY collection').all(),
    backups: db.prepare('SELECT COUNT(*) AS count FROM user_backups').get()?.count || 0,
    systemBackups: db.prepare('SELECT COUNT(*) AS count FROM system_backups').get()?.count || 0,
    uploads: db.prepare('SELECT COUNT(*) AS count FROM uploaded_files').get()?.count || 0,
  };
}

export { IMAGE_DIR, ANALYSIS_REPORTS_DIR, SYSTEM_BACKUP_DIR };
