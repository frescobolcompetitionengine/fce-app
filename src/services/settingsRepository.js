import { clone, generateId, sortItems } from './storage';
import { apiRequest, isServerStorageMode } from './apiClient';

const SETTINGS_KEY = 'frescobol_settings_v1';
const SETTINGS_SESSION_KEY = 'frescobol_settings_session_v1';

function getBrowserStorage() {
  if (typeof window === 'undefined') return null;
  return {
    readSession() {
      const raw = window.sessionStorage.getItem(SETTINGS_SESSION_KEY);
      if (raw) return raw;
      const legacy = window.localStorage.getItem(SETTINGS_KEY);
      if (legacy) {
        window.sessionStorage.setItem(SETTINGS_SESSION_KEY, legacy);
        window.localStorage.removeItem(SETTINGS_KEY);
      }
      return legacy;
    },
    writeSession(value) {
      window.sessionStorage.setItem(SETTINGS_SESSION_KEY, value);
    },
    clearSession() {
      window.sessionStorage.removeItem(SETTINGS_SESSION_KEY);
    },
  };
}

function readCachedSettings() {
  const storage = getBrowserStorage();
  if (!storage) return [];
  try {
    const raw = storage.readSession();
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeCachedSettings(items) {
  const storage = getBrowserStorage();
  if (!storage) return;
  storage.writeSession(JSON.stringify(Array.isArray(items) ? items : []));
}

function clearCachedSettings() {
  const storage = getBrowserStorage();
  if (!storage) return;
  storage.clearSession();
}

export async function listSettings(order = '-updated_at', limit = 500, ownerUserId = null) {
  if (isServerStorageMode()) {
    try {
      const records = await apiRequest('/api/records', {
        params: { collection: 'settings', order, limit, owner_user_id: ownerUserId },
      });
      writeCachedSettings(records);
      return records;
    } catch (error) {
      console.warn('Falling back to local settings storage:', error);
    }
  }
  const items = sortItems(readCachedSettings(), order);
  const filtered = ownerUserId ? items.filter((item) => item.owner_user_id === ownerUserId) : items;
  return filtered.slice(0, limit);
}

export async function loadLatestSettingsForUser(ownerUserId) {
  if (!ownerUserId) return null;
  const list = await listSettings('-updated_at', 500, ownerUserId);
  return list[0] || null;
}

export async function createSettings(data) {
  if (isServerStorageMode()) {
    try {
      const created = await apiRequest('/api/records', {
        method: 'POST',
        params: { collection: 'settings' },
        body: data,
      });
      const current = readCachedSettings();
      const next = [...current.filter((item) => item.id !== created.id), created];
      writeCachedSettings(next);
      return created;
    } catch (error) {
      console.warn('Falling back to local settings storage:', error);
    }
  }
  const current = readCachedSettings();
  const timestamp = new Date().toISOString();
  const record = {
    id: generateId(),
    created_at: timestamp,
    updated_at: timestamp,
    ...clone(data),
  };
  current.push(record);
  writeCachedSettings(current);
  return record;
}

export async function updateSettings(id, data) {
  if (isServerStorageMode()) {
    try {
      const updated = await apiRequest(`/api/records/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        params: { collection: 'settings' },
        body: data,
      });
      const current = readCachedSettings();
      const next = current.map((item) => (item.id === updated.id ? updated : item));
      writeCachedSettings(next);
      return updated;
    } catch (error) {
      console.warn('Falling back to local settings storage:', error);
    }
  }
  const current = readCachedSettings();
  const index = current.findIndex((item) => item.id === id);
  if (index === -1) throw new Error('Settings record not found.');

  const updated = {
    ...current[index],
    ...clone(data),
    id: current[index].id,
    created_at: current[index].created_at,
    updated_at: new Date().toISOString(),
  };
  current[index] = updated;
  writeCachedSettings(current);
  return updated;
}

export async function deleteSettings(id) {
  if (isServerStorageMode()) {
    try {
      const deleted = await apiRequest(`/api/records/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        params: { collection: 'settings' },
      });
      const next = readCachedSettings().filter((item) => item.id !== id);
      writeCachedSettings(next);
      return deleted;
    } catch (error) {
      console.warn('Falling back to local settings storage:', error);
    }
  }
  const current = readCachedSettings();
  writeCachedSettings(current.filter((item) => item.id !== id));
  return { id };
}
