import { clone, generateId, readJson, sortItems, writeJson } from './storage';
import { apiRequest, isServerStorageMode } from './apiClient';

const MATCH_HISTORY_KEY = 'frescobol_match_history_v1';

export async function listMatchHistory(order = '-played_at', limit = 100) {
  if (isServerStorageMode()) {
    try {
      return await apiRequest('/api/records', {
        params: { collection: 'match_history', order, limit },
      });
    } catch (error) {
      console.warn('Falling back to local match history storage:', error);
    }
  }
  return sortItems(readJson(MATCH_HISTORY_KEY, []), order).slice(0, limit);
}

export async function createMatchHistory(data) {
  if (isServerStorageMode()) {
    try {
      return await apiRequest('/api/records', {
        method: 'POST',
        params: { collection: 'match_history' },
        body: data,
      });
    } catch (error) {
      console.warn('Falling back to local match history storage:', error);
    }
  }
  const current = readJson(MATCH_HISTORY_KEY, []);
  const timestamp = new Date().toISOString();
  const record = {
    id: generateId(),
    created_at: timestamp,
    updated_at: timestamp,
    ...clone(data),
  };
  current.push(record);
  writeJson(MATCH_HISTORY_KEY, current);
  return record;
}

export async function updateMatchHistory(id, patch) {
  if (isServerStorageMode()) {
    try {
      return await apiRequest(`/api/records/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        params: { collection: 'match_history' },
        body: patch,
      });
    } catch (error) {
      console.warn('Falling back to local match history storage:', error);
    }
  }
  const current = readJson(MATCH_HISTORY_KEY, []);
  const timestamp = new Date().toISOString();
  let updated = null;
  const next = current.map((item) => {
    if (item.id !== id) return item;
    updated = {
      ...item,
      ...clone(patch),
      updated_at: timestamp,
    };
    return updated;
  });
  writeJson(MATCH_HISTORY_KEY, next);
  return updated;
}

export async function deleteMatchHistory(id) {
  if (isServerStorageMode()) {
    try {
      return await apiRequest(`/api/records/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        params: { collection: 'match_history' },
      });
    } catch (error) {
      console.warn('Falling back to local match history storage:', error);
    }
  }
  const current = readJson(MATCH_HISTORY_KEY, []);
  writeJson(MATCH_HISTORY_KEY, current.filter((item) => item.id !== id));
  return { id };
}

export async function deleteManyMatchHistory(ids) {
  if (isServerStorageMode()) {
    try {
      return await apiRequest('/api/records/bulk-delete', {
        method: 'POST',
        params: { collection: 'match_history' },
        body: { ids },
      });
    } catch (error) {
      console.warn('Falling back to local match history storage:', error);
    }
  }
  const current = readJson(MATCH_HISTORY_KEY, []);
  const next = current.filter((item) => !ids.includes(item.id));
  writeJson(MATCH_HISTORY_KEY, next);
  return ids;
}
