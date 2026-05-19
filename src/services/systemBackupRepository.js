import { apiRequest } from './apiClient';

export async function loadSystemBackups(limit = 25) {
  return apiRequest('/api/backups/system', {
    timeoutMs: 5000,
    params: { limit },
  });
}

export async function createSystemBackup({ reason = 'manual', source = 'AdminSystem', includeUploads = true } = {}) {
  return apiRequest('/api/backups/system', {
    method: 'POST',
    timeoutMs: 10000,
    body: { reason, source, include_uploads: includeUploads },
  });
}

export async function deleteSystemBackup(backupId) {
  if (!backupId) return null;
  return apiRequest(`/api/backups/system/${encodeURIComponent(backupId)}`, {
    method: 'DELETE',
    timeoutMs: 5000,
  });
}

export async function deleteManySystemBackups(ids = []) {
  const safeIds = Array.isArray(ids) ? ids.filter(Boolean) : [];
  if (!safeIds.length) return [];

  return apiRequest('/api/backups/system/bulk-delete', {
    method: 'POST',
    timeoutMs: 5000,
    body: { ids: safeIds },
  });
}

export async function restoreSystemBackup(backupId, { createSafetyBackup = true, reason = 'restore', source = 'AdminSystem' } = {}) {
  if (!backupId) return null;
  return apiRequest(`/api/backups/system/${encodeURIComponent(backupId)}/restore`, {
    method: 'POST',
    timeoutMs: 15000,
    body: { create_safety_backup: createSafetyBackup, reason, source },
  });
}
