import { apiRequest } from './apiClient';

const COLLECTION = 'analysis_reports';
const LOCAL_DB_NAME = 'frescobol_analysis_reports_db_v1';
const LOCAL_STORE_NAME = 'analysis_reports';

function isNetworkLikeError(error) {
  const message = String(error?.message || error || '').toLowerCase();
  return (
    message.includes('failed to fetch')
    || message.includes('networkerror')
    || message.includes('request failed with 500')
    || message.includes('connection refused')
    || message.includes('econnrefused')
  );
}

function openLocalDb() {
  if (typeof indexedDB === 'undefined') {
    return Promise.resolve(null);
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(LOCAL_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(LOCAL_STORE_NAME)) {
        const store = db.createObjectStore(LOCAL_STORE_NAME, { keyPath: 'id' });
        store.createIndex('updated_at', 'updated_at', { unique: false });
        store.createIndex('created_at', 'created_at', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function localTx(mode, executor) {
  const db = await openLocalDb();
  if (!db) return null;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(LOCAL_STORE_NAME, mode);
    const store = tx.objectStore(LOCAL_STORE_NAME);
    Promise.resolve()
      .then(() => executor(store))
      .then((result) => {
        tx.oncomplete = () => {
          db.close();
          resolve(result);
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
        tx.onabort = () => {
          db.close();
          reject(tx.error || new Error('analysis_reports_local_tx_aborted'));
        };
      })
      .catch((error) => {
        db.close();
        reject(error);
      });
  });
}

function cloneRecord(record) {
  return record ? JSON.parse(JSON.stringify(record)) : null;
}

function normalizeLocalRecord(record) {
  if (!record) return null;
  return {
    ...record,
    id: record.id || record.match_key,
    kind: record.kind || record.source_kind || 'unknown',
    fileName: record.file_name || record.fileName || '',
    displayDate: record.display_date || record.displayDate || '',
    displayLeftName: record.display_left_name || record.displayLeftName || '',
    displayRightName: record.display_right_name || record.displayRightName || '',
    displayScore: record.display_score ?? record.displayScore ?? 0,
  };
}

async function listLocalAnalysisReports(order = '-updated_at', limit = 200) {
  const db = await openLocalDb();
  if (!db) return [];

  const records = await new Promise((resolve, reject) => {
    const tx = db.transaction(LOCAL_STORE_NAME, 'readonly');
    const store = tx.objectStore(LOCAL_STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });

  db.close();
  const direction = String(order || '').startsWith('-') ? -1 : 1;
  return records
    .map(normalizeLocalRecord)
    .filter(Boolean)
    .sort((a, b) => {
      const left = String(a.updated_at || a.created_at || '');
      const right = String(b.updated_at || b.created_at || '');
      return left.localeCompare(right) * direction;
    })
    .slice(0, Number.isFinite(Number(limit)) ? Math.max(1, Number(limit)) : 200);
}

async function getLocalAnalysisReport(id) {
  if (!id) return null;
  return localTx('readonly', (store) => new Promise((resolve, reject) => {
    const request = store.get(id);
    request.onsuccess = () => resolve(normalizeLocalRecord(request.result));
    request.onerror = () => reject(request.error);
  }));
}

async function putLocalAnalysisReport(data) {
  if (!data?.id) return null;
  const payload = cloneRecord(data);
  return localTx('readwrite', (store) => new Promise((resolve, reject) => {
    const request = store.put(payload);
    request.onsuccess = () => resolve(normalizeLocalRecord(payload));
    request.onerror = () => reject(request.error);
  }));
}

async function deleteLocalAnalysisReport(id) {
  if (!id) return null;
  return localTx('readwrite', (store) => new Promise((resolve, reject) => {
    const request = store.delete(id);
    request.onsuccess = () => resolve({ id });
    request.onerror = () => reject(request.error);
  }));
}

function sanitizeServerPayload(data = {}) {
  const {
    raw_text,
    rawText,
    analysis_data,
    analysisData,
    ...rest
  } = data || {};
  return rest;
}

export async function listAnalysisReports(order = '-updated_at', limit = 200) {
  try {
    return await apiRequest('/api/records', {
      params: { collection: COLLECTION, order, limit },
      timeoutMs: 2500,
    });
  } catch (error) {
    if (!isNetworkLikeError(error)) throw error;
    return listLocalAnalysisReports(order, limit);
  }
}

export async function getAnalysisReport(id) {
  if (!id) return null;

  try {
    return await apiRequest(`/api/records/${encodeURIComponent(id)}`, {
      params: { collection: COLLECTION },
      timeoutMs: 2500,
    });
  } catch (error) {
    if (!isNetworkLikeError(error)) throw error;
    return getLocalAnalysisReport(id);
  }
}

export async function createAnalysisReport(data) {
  const serverPayload = sanitizeServerPayload(data);

  try {
    return await apiRequest('/api/records', {
      method: 'POST',
      params: { collection: COLLECTION },
      body: serverPayload,
      timeoutMs: 2500,
    });
  } catch (error) {
    if (!isNetworkLikeError(error)) throw error;
    return putLocalAnalysisReport(data);
  }
}

export async function deleteAnalysisReport(id) {
  if (!id) return null;

  try {
    return await apiRequest(`/api/records/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      params: { collection: COLLECTION },
      timeoutMs: 2500,
    });
  } catch (error) {
    if (!isNetworkLikeError(error)) throw error;
    return deleteLocalAnalysisReport(id);
  }
}
