import { clone, generateId, readJson, sortItems, writeJson } from './storage';
import { apiRequest, isServerStorageMode } from './apiClient';

const GAME_SESSIONS_KEY = 'frescobol_game_sessions_v1';
const GAME_SESSION_COLLECTION = 'game_sessions';

function toMs(value) {
  const parsed = new Date(value || '').getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeSessionTimeLeft(session, nowMs = Date.now()) {
  const savedTimeLeft = Number(session?.time_left ?? session?.timeLeft ?? 0);
  const durationMinutes = Number(session?.match_duration_minutes ?? session?.matchDurationMinutes ?? 0);
  const durationMs = Number.isFinite(durationMinutes) && durationMinutes > 0 ? durationMinutes * 60 * 1000 : null;
  const hasClockMetadata = session?.clock_accumulated_ms != null || session?.clock_started_at_ms != null;
  const isRunning = session?.game_status === 'live' && session?.is_running !== false;
  const warmupDurationMinutes = Number(session?.warmup_duration_minutes ?? session?.match_duration_minutes ?? 0);
  const warmupDurationMs = Number.isFinite(warmupDurationMinutes) && warmupDurationMinutes > 0 ? warmupDurationMinutes * 60 * 1000 : null;
  const hasWarmupMetadata = session?.warmup_accumulated_ms != null || session?.warmup_started_at_ms != null;
  const isWarmup = session?.game_status === 'warmup' && session?.is_warming_up !== false;

  if (durationMs && hasClockMetadata) {
    const accumulatedMs = Math.max(0, Number(session?.clock_accumulated_ms ?? 0) || 0);
    const startedAtMs = toMs(session?.clock_started_at_ms);
    const runningElapsedMs = isRunning && startedAtMs ? Math.max(0, nowMs - startedAtMs) : 0;
    const remainingMs = durationMs - (accumulatedMs + runningElapsedMs);
    return Math.max(0, Math.ceil(remainingMs / 1000));
  }

  if (warmupDurationMs && hasWarmupMetadata && isWarmup) {
    const accumulatedMs = Math.max(0, Number(session?.warmup_accumulated_ms ?? 0) || 0);
    const startedAtMs = toMs(session?.warmup_started_at_ms);
    const runningElapsedMs = startedAtMs ? Math.max(0, nowMs - startedAtMs) : 0;
    const remainingMs = warmupDurationMs - (accumulatedMs + runningElapsedMs);
    return Math.max(0, Math.ceil(remainingMs / 1000));
  }

  if (!isRunning) {
    return Math.max(0, savedTimeLeft);
  }

  const updatedAtMs = toMs(session?.updated_at || session?.last_state_change_at || session?.created_at);
  if (!updatedAtMs) {
    return Math.max(0, savedTimeLeft);
  }

  const elapsedSeconds = Math.max(0, Math.floor((nowMs - updatedAtMs) / 1000));
  return Math.max(0, savedTimeLeft - elapsedSeconds);
}

export function normalizeGameSession(session, nowMs = Date.now()) {
  if (!session) return session;
  const timeLeft = normalizeSessionTimeLeft(session, nowMs);
  const expired = session?.game_status === 'live' && session?.is_running !== false && timeLeft <= 0;
  return {
    ...session,
    time_left: timeLeft,
    game_status: expired ? 'finished' : session.game_status,
    is_running: expired ? false : session.is_running,
    match_ended: expired ? true : session.match_ended,
  };
}

export async function listGameSessions(order = '-updated_at', limit = 100, ownerUserId = null) {
  if (isServerStorageMode()) {
    try {
      const sessions = await apiRequest('/api/records', {
        params: { collection: GAME_SESSION_COLLECTION, order, limit, owner_user_id: ownerUserId },
      });
      return sessions.map((session) => normalizeGameSession(session));
    } catch (error) {
      console.warn('Falling back to local game session storage:', error);
    }
  }

  const items = sortItems(readJson(GAME_SESSIONS_KEY, []), order).slice(0, limit);
  const filtered = !ownerUserId ? items : items.filter((item) => item.owner_user_id === ownerUserId);
  return filtered.map((session) => normalizeGameSession(session));
}

export async function getLatestGameSession(ownerUserId) {
  if (!ownerUserId) return null;
  const sessions = await listGameSessions('-updated_at', 50, ownerUserId);
  return sessions.find((item) => isActiveSession(item)) || null;
}

function isActiveSession(session) {
  return !session?.match_ended && (
    session.game_status === 'warmup'
    || session.game_status === 'live'
    || (session.game_status === 'paused' && (
      !session.warmup_completed
      || session.is_warming_up
      || session.game_started
      || session.is_running
      || session.warmup_started_at_ms
      || Number(session.warmup_accumulated_ms || 0) > 0
    ))
  );
}

export async function clearActiveGameSessions(ownerUserId) {
  if (!ownerUserId) return [];
  const sessions = await listGameSessions('-updated_at', 100, ownerUserId);
  const activeSessions = sessions.filter((session) => isActiveSession(session));
  if (activeSessions.length === 0) return [];

  await Promise.allSettled(activeSessions.map((session) => deleteGameSession(session.id)));
  return activeSessions.map((session) => session.id);
}

export async function createGameSession(data) {
  if (isServerStorageMode()) {
    try {
      return await apiRequest('/api/records', {
        method: 'POST',
        params: { collection: GAME_SESSION_COLLECTION },
        body: data,
      });
    } catch (error) {
      console.warn('Falling back to local game session storage:', error);
    }
  }

  const current = readJson(GAME_SESSIONS_KEY, []);
  const timestamp = new Date().toISOString();
  const record = {
    id: generateId(),
    created_at: timestamp,
    updated_at: timestamp,
    ...clone(data),
  };
  current.push(record);
  writeJson(GAME_SESSIONS_KEY, current);
  return record;
}

export async function updateGameSession(id, patch) {
  if (isServerStorageMode()) {
    try {
      return await apiRequest(`/api/records/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        params: { collection: GAME_SESSION_COLLECTION },
        body: patch,
      });
    } catch (error) {
      console.warn('Falling back to local game session storage:', error);
    }
  }

  const current = readJson(GAME_SESSIONS_KEY, []);
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
  writeJson(GAME_SESSIONS_KEY, next);
  return updated;
}

export async function finalizeGameSession(id, patch = {}) {
  return updateGameSession(id, {
    ...patch,
    game_status: 'finished',
    is_running: false,
    match_ended: true,
    finished_at: patch.finished_at || new Date().toISOString(),
  });
}

export async function deleteGameSession(id) {
  if (isServerStorageMode()) {
    try {
      return await apiRequest(`/api/records/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        params: { collection: GAME_SESSION_COLLECTION },
      });
    } catch (error) {
      console.warn('Falling back to local game session storage:', error);
    }
  }

  const current = readJson(GAME_SESSIONS_KEY, []);
  writeJson(GAME_SESSIONS_KEY, current.filter((item) => item.id !== id));
  return { id };
}
