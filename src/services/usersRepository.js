import { clone, sortItems } from './storage';
import { apiRequest, isServerStorageMode } from './apiClient';

const USERS_KEY = 'frescobol_users_v1';
const USER_BACKUPS_KEY = 'frescobol_user_backups_v1';
const MATCH_HISTORY_KEY = 'frescobol_match_history_v1';
const GAME_SESSIONS_KEY = 'frescobol_game_sessions_v1';
const SETTINGS_KEY = 'frescobol_settings_v1';

function getSessionStore() {
  if (typeof window === 'undefined') return null;
  return window.sessionStorage;
}

function readCachedJson(key, fallback = []) {
  const store = getSessionStore();
  if (!store) return Array.isArray(fallback) ? [...fallback] : fallback;

  try {
    const sessionRaw = store.getItem(key);
    if (sessionRaw) {
      return JSON.parse(sessionRaw);
    }

    const legacyRaw = window.localStorage.getItem(key);
    if (legacyRaw) {
      store.setItem(key, legacyRaw);
      window.localStorage.removeItem(key);
      return JSON.parse(legacyRaw);
    }
    return Array.isArray(fallback) ? [...fallback] : fallback;
  } catch {
    return Array.isArray(fallback) ? [...fallback] : fallback;
  }
}

function writeCachedJson(key, value) {
  const store = getSessionStore();
  if (!store) return;
  store.setItem(key, JSON.stringify(value));
}

function removeCachedJson(key) {
  const store = getSessionStore();
  if (!store) return;
  store.removeItem(key);
}

export function readLocalUsers() {
  return readCachedJson(USERS_KEY, []);
}

export function writeLocalUsers(users) {
  writeCachedJson(USERS_KEY, Array.isArray(users) ? users : []);
}

export function clearLocalUsers() {
  removeCachedJson(USERS_KEY);
}

function writeLocalUserBackups(backups) {
  writeCachedJson(USER_BACKUPS_KEY, Array.isArray(backups) ? backups : []);
}

function readLocalUserBackups() {
  return sortItems(readCachedJson(USER_BACKUPS_KEY, []), '-updated_at');
}

function readLocalBackupSnapshot() {
  return {
    users: readLocalUsers(),
    match_history: readCachedJson(MATCH_HISTORY_KEY, []),
    game_sessions: readCachedJson(GAME_SESSIONS_KEY, []),
    settings: readCachedJson(SETTINGS_KEY, []),
  };
}

function normalizeBackupSnapshot(snapshot = {}) {
  if (Array.isArray(snapshot)) {
    return {
      users: snapshot,
      match_history: [],
      game_sessions: [],
    };
  }

  return {
    users: Array.isArray(snapshot.users) ? snapshot.users : [],
    match_history: Array.isArray(snapshot.match_history) ? snapshot.match_history : [],
    game_sessions: Array.isArray(snapshot.game_sessions) ? snapshot.game_sessions : [],
    settings: Array.isArray(snapshot.settings) ? snapshot.settings : [],
  };
}

function createLocalUserBackup(snapshotOrUsers, { reason = 'auto', source = 'usersRepository' } = {}) {
  const snapshot = Array.isArray(snapshotOrUsers)
    ? { ...readLocalBackupSnapshot(), users: clone(snapshotOrUsers) }
    : normalizeBackupSnapshot(snapshotOrUsers);
  const now = new Date().toISOString();
  const snapshotHash = JSON.stringify(snapshot);
  const existing = readLocalUserBackups().find((item) => item.snapshot_hash === snapshotHash);
  if (existing) {
    return existing;
  }

  const backup = {
    id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    created_at: now,
    updated_at: now,
    reason: String(reason || 'auto'),
    source: String(source || 'usersRepository'),
    snapshot_hash: snapshotHash,
    user_count: snapshot.users.length,
    game_count: snapshot.match_history.length + snapshot.game_sessions.length,
    settings_count: snapshot.settings.length,
    users: snapshot.users,
    match_history: snapshot.match_history,
    game_sessions: snapshot.game_sessions,
    settings: snapshot.settings,
    snapshot,
    storage_scope: 'local',
  };

  const next = [backup, ...readLocalUserBackups()].slice(0, 25);
  writeLocalUserBackups(next);
  return backup;
}

function mergeBackups(remoteBackups = [], localBackups = [], limit = 25) {
  const merged = new Map();
  for (const backup of [...localBackups, ...remoteBackups]) {
    if (!backup || !backup.id) continue;
    const key = backup.snapshot_hash || backup.id;
    merged.set(key, backup);
  }

  return [...merged.values()]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, limit);
}

function deleteLocalUserBackup(backupId) {
  const current = readLocalUserBackups();
  const next = current.filter((item) => item.id !== backupId);
  writeLocalUserBackups(next);
  return current.length !== next.length ? { id: backupId } : null;
}

function deleteManyLocalUserBackups(ids = []) {
  const safeIds = Array.isArray(ids) ? ids.filter(Boolean) : [];
  if (!safeIds.length) return [];
  const current = readLocalUserBackups();
  const next = current.filter((item) => !safeIds.includes(item.id));
  writeLocalUserBackups(next);
  return safeIds;
}

export async function loadRemoteUsers() {
  return apiRequest('/api/records', {
    params: {
      collection: 'users',
      order: '-updated_at',
      limit: 5000,
    },
  });
}

export async function loadUsersSnapshot() {
  if (!isServerStorageMode()) {
    return { users: readLocalUsers(), source: 'local' };
  }

  try {
    return { users: await loadRemoteUsers(), source: 'remote' };
  } catch (error) {
    return { users: readLocalUsers(), source: 'local-fallback', error };
  }
}

export async function createUsersBackup(users, { reason = 'auto', source = 'usersRepository' } = {}) {
  if (!isServerStorageMode()) {
    return createLocalUserBackup(users, { reason, source });
  }

  try {
    return await apiRequest('/api/backups/users', {
      method: 'POST',
      timeoutMs: 5000,
      body: { reason, source },
    });
  } catch (error) {
    return createLocalUserBackup(users, {
      reason: `${reason}.localFallback`,
      source,
    });
  }
}

export async function loadUserBackups(limit = 25) {
  if (!isServerStorageMode()) {
    return readLocalUserBackups().slice(0, limit);
  }

  try {
    const remoteBackups = await apiRequest('/api/backups/users', {
      timeoutMs: 5000,
      params: { limit },
    });
    return mergeBackups(remoteBackups, readLocalUserBackups(), limit);
  } catch (error) {
    return readLocalUserBackups().slice(0, limit);
  }
}

export async function deleteUserBackup(backupId) {
  if (!backupId) return null;

  if (!isServerStorageMode()) {
    return deleteLocalUserBackup(backupId);
  }

  try {
    return await apiRequest(`/api/backups/users/${encodeURIComponent(backupId)}`, {
      method: 'DELETE',
      timeoutMs: 5000,
    });
  } catch (error) {
    return deleteLocalUserBackup(backupId);
  }
}

export async function deleteManyUserBackups(ids = []) {
  const safeIds = Array.isArray(ids) ? ids.filter(Boolean) : [];
  if (!safeIds.length) return [];

  if (!isServerStorageMode()) {
    return deleteManyLocalUserBackups(safeIds);
  }

  try {
    return await apiRequest('/api/backups/users/bulk-delete', {
      method: 'POST',
      timeoutMs: 5000,
      body: { ids: safeIds },
    });
  } catch (error) {
    return deleteManyLocalUserBackups(safeIds);
  }
}

export async function restoreUsersBackup(backupId, { createSafetyBackup = true, reason = 'restore', source = 'usersRepository' } = {}) {
  if (!isServerStorageMode()) {
    const backup = readLocalUserBackups().find((item) => item.id === backupId);
    if (!backup) return null;

    const snapshot = normalizeBackupSnapshot(backup.snapshot || backup);
    writeCachedJson(USERS_KEY, snapshot.users);
    writeCachedJson(MATCH_HISTORY_KEY, snapshot.match_history);
    writeCachedJson(GAME_SESSIONS_KEY, snapshot.game_sessions);
    writeCachedJson(SETTINGS_KEY, snapshot.settings);
    return {
      backup,
      restoredUsers: snapshot.users,
      restoredCount: snapshot.users.length,
      restoredMatchHistoryCount: snapshot.match_history.length,
      restoredGameSessionCount: snapshot.game_sessions.length,
      restoredSettingsCount: snapshot.settings.length,
      reason,
      source,
    };
  }

  try {
    return await apiRequest(`/api/backups/users/${encodeURIComponent(backupId)}/restore`, {
      method: 'POST',
      timeoutMs: 5000,
      body: {
        create_safety_backup: createSafetyBackup,
        reason,
        source,
      },
    });
  } catch (error) {
    return null;
  }
}

export async function deleteRemoteUsers(userIds = []) {
  const ids = Array.isArray(userIds) ? userIds.filter(Boolean) : [];
  if (!ids.length) return [];

  if (!isServerStorageMode()) {
    return ids;
  }

  try {
    await Promise.all(ids.map((id) => apiRequest(`/api/records/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      params: { collection: 'users' },
    })));
    return ids;
  } catch (error) {
    return ids;
  }
}

export async function persistUsers(users, { deleteIds = [] } = {}) {
  const nextUsers = Array.isArray(users) ? users : [];
  const safeDeleteIds = Array.isArray(deleteIds) ? deleteIds.filter(Boolean) : [];

  if (!isServerStorageMode()) {
    writeLocalUsers(nextUsers);
    return nextUsers;
  }

  try {
    const remoteUsers = await loadRemoteUsers().catch(() => []);
    if (remoteUsers.length > 0) {
      await createUsersBackup(remoteUsers, {
        reason: safeDeleteIds.length > 0 ? 'explicit_delete' : 'save_users',
        source: 'usersRepository.persistUsers',
      });
    }

    for (const user of nextUsers) {
      await apiRequest('/api/records', {
        method: 'POST',
        params: { collection: 'users' },
        body: user,
      });
    }

    if (safeDeleteIds.length > 0) {
      await deleteRemoteUsers(safeDeleteIds);
    }

    clearLocalUsers();
    return nextUsers;
  } catch (error) {
    writeLocalUsers(nextUsers);
    return nextUsers;
  }
}
