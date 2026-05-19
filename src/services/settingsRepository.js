import { clone, generateId, readJson, removeItem, sortItems, writeJson } from './storage';
import { apiRequest, isServerStorageMode } from './apiClient';

const SETTINGS_SESSION_KEY = 'frescobol_settings_session_v1';
const DEFAULT_PROFILE_NAME = 'default';
const DEFAULT_PROFILE_VALUES = {
  duo_name: '',
  visibility: 'private',
  distance_meters: 9,
  match_duration_minutes: 5,
  warmup_duration_minutes: 2,
  player_left_name: 'Jogador 1',
  player_right_name: 'Jogador 2',
  player_left_photo: '',
  player_right_photo: '',
  player_left_radar_enabled: false,
  player_right_radar_enabled: false,
  language: 'pt-BR',
  scoring_mode: 'option_1',
  min_scoring_speed: 50,
  free_ball_drops: 5,
  max_ball_drops: 20,
  count_ball_drops: true,
  balance_enabled: true,
  continuity_enabled: false,
  power_enabled: false,
};

export const SETTINGS_PROFILE_DEFAULTS = {
  ...DEFAULT_PROFILE_VALUES,
};

function readCachedSettings() {
  return readJson(SETTINGS_SESSION_KEY, []);
}

function writeCachedSettings(items) {
  writeJson(SETTINGS_SESSION_KEY, Array.isArray(items) ? items : []);
}

function clearCachedSettings() {
  removeItem(SETTINGS_SESSION_KEY);
}

function normalizeProfileName(profileName, isDefaultProfile = false) {
  if (isDefaultProfile) return DEFAULT_PROFILE_NAME;
  const normalized = String(profileName || '').trim();
  return normalized || 'Perfil sem nome';
}

function normalizeSettingsRecord(data = {}) {
  const isDefaultProfile = Boolean(data.is_default_profile);
  const profileName = normalizeProfileName(data.profile_name, isDefaultProfile);

  return {
    ...clone(SETTINGS_PROFILE_DEFAULTS),
    ...clone(data),
    profile_name: profileName,
    is_default_profile: isDefaultProfile,
    is_active_profile: Boolean(data.is_active_profile),
  };
}

function isDefaultProfileOutOfSync(profile = {}) {
  return (
    String(profile.duo_name || '').trim() !== DEFAULT_PROFILE_VALUES.duo_name ||
    String(profile.visibility || '').trim() !== DEFAULT_PROFILE_VALUES.visibility ||
    String(profile.player_left_name || '').trim() !== DEFAULT_PROFILE_VALUES.player_left_name ||
    String(profile.player_right_name || '').trim() !== DEFAULT_PROFILE_VALUES.player_right_name ||
    String(profile.player_left_photo || '').trim() !== DEFAULT_PROFILE_VALUES.player_left_photo ||
    String(profile.player_right_photo || '').trim() !== DEFAULT_PROFILE_VALUES.player_right_photo ||
    Boolean(profile.player_left_radar_enabled ?? DEFAULT_PROFILE_VALUES.player_left_radar_enabled) !== DEFAULT_PROFILE_VALUES.player_left_radar_enabled ||
    Boolean(profile.player_right_radar_enabled ?? DEFAULT_PROFILE_VALUES.player_right_radar_enabled) !== DEFAULT_PROFILE_VALUES.player_right_radar_enabled ||
    String(profile.language || '').trim() !== DEFAULT_PROFILE_VALUES.language ||
    Number(profile.distance_meters ?? DEFAULT_PROFILE_VALUES.distance_meters) !== DEFAULT_PROFILE_VALUES.distance_meters ||
    Number(profile.match_duration_minutes ?? DEFAULT_PROFILE_VALUES.match_duration_minutes) !== DEFAULT_PROFILE_VALUES.match_duration_minutes ||
    Number(profile.warmup_duration_minutes ?? DEFAULT_PROFILE_VALUES.warmup_duration_minutes) !== DEFAULT_PROFILE_VALUES.warmup_duration_minutes ||
    Number(profile.min_scoring_speed ?? DEFAULT_PROFILE_VALUES.min_scoring_speed) !== DEFAULT_PROFILE_VALUES.min_scoring_speed ||
    Number(profile.free_ball_drops ?? DEFAULT_PROFILE_VALUES.free_ball_drops) !== DEFAULT_PROFILE_VALUES.free_ball_drops ||
    Number(profile.max_ball_drops ?? DEFAULT_PROFILE_VALUES.max_ball_drops) !== DEFAULT_PROFILE_VALUES.max_ball_drops ||
    Boolean(profile.count_ball_drops ?? DEFAULT_PROFILE_VALUES.count_ball_drops) !== DEFAULT_PROFILE_VALUES.count_ball_drops ||
    Boolean(profile.balance_enabled ?? DEFAULT_PROFILE_VALUES.balance_enabled) !== DEFAULT_PROFILE_VALUES.balance_enabled ||
    Boolean(profile.continuity_enabled ?? DEFAULT_PROFILE_VALUES.continuity_enabled) !== DEFAULT_PROFILE_VALUES.continuity_enabled ||
    Boolean(profile.power_enabled ?? DEFAULT_PROFILE_VALUES.power_enabled) !== DEFAULT_PROFILE_VALUES.power_enabled ||
    String(profile.scoring_mode || '').trim() !== DEFAULT_PROFILE_VALUES.scoring_mode
  );
}

export function buildDefaultSettingsProfile({
  ownerUserId = null,
  ownerEmail = '',
  isActive = true,
} = {}) {
  return normalizeSettingsRecord({
    ...DEFAULT_PROFILE_VALUES,
    owner_user_id: ownerUserId,
    owner_email: ownerEmail,
    profile_name: DEFAULT_PROFILE_NAME,
    is_default_profile: true,
    is_active_profile: isActive,
  });
}

export function selectPreferredSettingsProfile(items = []) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return (
    items.find((item) => item.is_active_profile) ||
    items.find((item) => item.is_default_profile) ||
    items[0] ||
    null
  );
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

export async function ensureDefaultSettingsProfile(ownerUserId, ownerEmail = '', { activate = true } = {}) {
  if (!ownerUserId) return null;
  const list = await listSettings('-updated_at', 500, ownerUserId);
  const defaultProfile = list.find((item) => item.is_default_profile);
  if (defaultProfile) {
    if (!isDefaultProfileOutOfSync(defaultProfile)) return defaultProfile;
    return updateSettings(defaultProfile.id, {
      ...defaultProfile,
      ...DEFAULT_PROFILE_VALUES,
      profile_name: DEFAULT_PROFILE_NAME,
      is_default_profile: true,
      is_active_profile: Boolean(defaultProfile.is_active_profile),
    }, { allowDefaultRepair: true });
  }

  return createSettings(buildDefaultSettingsProfile({
    ownerUserId,
    ownerEmail,
    isActive: activate,
  }), { allowDefaultProfileCreation: true });
}

export async function loadLatestSettingsForUser(ownerUserId, ownerEmail = '') {
  if (!ownerUserId) return null;
  await ensureDefaultSettingsProfile(ownerUserId, ownerEmail, { activate: true });
  const list = await listSettings('-updated_at', 500, ownerUserId);
  return selectPreferredSettingsProfile(list);
}

export async function createSettings(data, options = {}) {
  const recordData = normalizeSettingsRecord(data);
  if (recordData.is_default_profile && !options.allowDefaultProfileCreation) {
    throw new Error('O perfil default é fixo e é gerido pelo sistema.');
  }

  if (isServerStorageMode()) {
    try {
      const created = await apiRequest('/api/records', {
        method: 'POST',
        params: { collection: 'settings' },
        body: recordData,
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
    ...recordData,
  };
  current.push(record);
  writeCachedSettings(current);
  return record;
}

export async function updateSettings(id, data, options = {}) {
  if (isServerStorageMode()) {
    try {
      const current = readCachedSettings();
      const existing = current.find((item) => item.id === id) || null;
      if (existing?.is_default_profile && !options.allowDefaultRepair) {
        const allowedKeys = new Set(['is_active_profile']);
        const incomingKeys = Object.keys(data || {});
        const hasDisallowedChange = incomingKeys.some((key) => !allowedKeys.has(key));
        if (hasDisallowedChange) {
          throw new Error('O perfil default é fixo. Crie um novo perfil para guardar alterações.');
        }
      }
      const mergedForServer = existing
        ? {
            ...existing,
            ...clone(data),
            profile_name: normalizeProfileName(
              data.profile_name ?? existing.profile_name,
              Boolean(existing.is_default_profile || data.is_default_profile),
            ),
            is_default_profile: Boolean(existing.is_default_profile || data.is_default_profile),
            is_active_profile: data.is_active_profile ?? existing.is_active_profile ?? false,
          }
        : normalizeSettingsRecord(data);

      const updated = await apiRequest(`/api/records/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        params: { collection: 'settings' },
        body: mergedForServer,
      });
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

  const existing = current[index];
  if (existing.is_default_profile && !options.allowDefaultRepair) {
    const allowedKeys = new Set(['is_active_profile']);
    const incomingKeys = Object.keys(data || {});
    const hasDisallowedChange = incomingKeys.some((key) => !allowedKeys.has(key));
    if (hasDisallowedChange) {
      throw new Error('O perfil default é fixo. Crie um novo perfil para guardar alterações.');
    }
  }
  const updated = {
    ...existing,
    ...clone(data),
    id: existing.id,
    created_at: existing.created_at,
    updated_at: new Date().toISOString(),
    profile_name: normalizeProfileName(
      data.profile_name ?? existing.profile_name,
      Boolean(existing.is_default_profile || data.is_default_profile),
    ),
    is_default_profile: Boolean(existing.is_default_profile || data.is_default_profile),
    is_active_profile: data.is_active_profile ?? existing.is_active_profile ?? false,
  };
  if (updated.is_default_profile) {
    updated.profile_name = DEFAULT_PROFILE_NAME;
  }
  current[index] = updated;
  writeCachedSettings(current);
  return updated;
}

export async function setActiveSettingsProfile(id, ownerUserId) {
  if (!id || !ownerUserId) return null;
  const profiles = await listSettings('-updated_at', 500, ownerUserId);
  const target = profiles.find((item) => item.id === id);
  if (!target) throw new Error('Settings profile not found.');

  const updates = profiles.filter((item) => item.id !== id && item.is_active_profile);
  await Promise.all(updates.map((item) => updateSettings(item.id, { is_active_profile: false })));
  const updatedTarget = await updateSettings(target.id, { is_active_profile: true });
  return updatedTarget;
}

export async function deleteSettings(id) {
  const current = readCachedSettings();
  const target = current.find((item) => item.id === id);
  if (target?.is_default_profile) {
    throw new Error('O perfil default não pode ser apagado.');
  }

  if (isServerStorageMode()) {
    try {
      const deleted = await apiRequest(`/api/records/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        params: { collection: 'settings' },
      });
      const next = current.filter((item) => item.id !== id);
      writeCachedSettings(next);
      return deleted;
    } catch (error) {
      console.warn('Falling back to local settings storage:', error);
    }
  }

  writeCachedSettings(current.filter((item) => item.id !== id));
  return { id };
}
