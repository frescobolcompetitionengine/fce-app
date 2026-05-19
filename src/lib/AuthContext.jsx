import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_LEGACY_VALIDITY,
  DEFAULT_NEW_USER_VALIDITY,
  buildSubscriptionTerms,
  isSubscriptionExpired,
  normalizeUserSubscription,
  normalizeValidityAmount,
  normalizeValidityUnit,
} from '@/lib/subscription';
import {
  loadUsersSnapshot,
  persistUsers,
} from '@/services/usersRepository';
import { loadLatestSettingsForUser } from '@/services/settingsRepository';
import { apiRequest } from '@/services/apiClient';
import { clearTrackedNavigationPaths } from '@/lib/NavigationTracker';

const AuthContext = createContext(null);

const AUTH_SESSION_ENDPOINT = '/api/auth/session';
const MAIN_ADMIN_EMAIL = 'admin@frescobol.local';
const MAIN_ADMIN_PASSWORD = 'Luana123*';
let bootstrapUsersPromise = null;

const newId = () => (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`);

/**
 * @typedef {Error & { code: string }} TaggedAuthError
 */

/**
 * @param {string} message
 * @param {string} code
 * @returns {TaggedAuthError}
 */
function createTaggedError(message, code) {
  const error = /** @type {TaggedAuthError} */ (new Error(message));
  error.code = code;
  return error;
}

async function persistSessionRecord(payload) {
  return apiRequest(AUTH_SESSION_ENDPOINT, {
    method: 'POST',
    body: payload,
    timeoutMs: 2500,
  });
}

async function loadSessionRecord() {
  try {
    return await apiRequest(AUTH_SESSION_ENDPOINT, {
      method: 'GET',
      timeoutMs: 2500,
    });
  } catch {
    return null;
  }
}

async function clearSessionRecord() {
  try {
    await apiRequest(AUTH_SESSION_ENDPOINT, {
      method: 'DELETE',
      timeoutMs: 2500,
    });
  } catch {
    // Ignore session cleanup failures; the backend session is the source of truth.
  }
}

function isStrongPassword(password) {
  const value = String(password || '');
  if (value.length < 8) return false;
  if (!/[a-z]/.test(value)) return false;
  if (!/[A-Z]/.test(value)) return false;
  if (!/[0-9]/.test(value)) return false;
  if (!/[^A-Za-z0-9]/.test(value)) return false;
  return true;
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isValidEmail(email) {
  const value = normalizeEmail(email);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function migrateUsers(users) {
  return users.map((user) => {
    const normalized = normalizeUserSubscription(user, DEFAULT_LEGACY_VALIDITY);
    if (String(normalized.email || '').toLowerCase() === MAIN_ADMIN_EMAIL) {
      return {
        ...normalized,
        password: MAIN_ADMIN_PASSWORD,
        force_password_change: false,
      };
    }
    return normalized;
  });
}

function dedupeUsersByEmail(users) {
  const seen = new Set();
  const next = [];

  for (const user of users) {
    const emailKey = normalizeEmail(user?.email) || String(user?.id || '');
    if (seen.has(emailKey)) continue;
    seen.add(emailKey);
    next.push(user);
  }

  return next;
}

function createAdminUser() {
  return {
    id: newId(),
    first_name: 'Administrador',
    last_name: 'Sistema',
    phone: '',
    email: MAIN_ADMIN_EMAIL,
    password: MAIN_ADMIN_PASSWORD,
    force_password_change: true,
    role: 'admin',
    created_at: new Date().toISOString(),
    ...buildSubscriptionTerms({
      amount: 12,
      unit: 'months',
      neverExpires: true,
      startAt: new Date(),
    }),
  };
}

async function loadInitialUsers() {
  if (bootstrapUsersPromise) return bootstrapUsersPromise;

  bootstrapUsersPromise = (async () => {
  const snapshot = await loadUsersSnapshot();
    const users = dedupeUsersByEmail(migrateUsers(snapshot.users || []));

    if (users.length > 0) {
      await persistUsers(users);
      return users;
    }

    const admin = createAdminUser();
    await persistUsers([admin]);
    return [admin];
  })();

  try {
    return await bootstrapUsersPromise;
  } finally {
    bootstrapUsersPromise = null;
  }
}

export const AuthProvider = ({ children }) => {
  const [users, setUsers] = useState([]);
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(true);
  const [appPublicSettings, setAppPublicSettings] = useState(null);
  const [authError, setAuthError] = useState(null);

  const refreshUsers = async () => {
    const snapshot = await loadUsersSnapshot();
    const list = dedupeUsersByEmail(migrateUsers(snapshot.users || []));
    setUsers(list);
    return list;
  };

  const refreshPublicSettings = async (userId, ownerEmail = '') => {
    if (!userId || userId === 'spectator') {
      setAppPublicSettings(null);
      setIsLoadingPublicSettings(false);
      return null;
    }

    setIsLoadingPublicSettings(true);
    try {
      const latestSettings = await loadLatestSettingsForUser(userId, ownerEmail);
      setAppPublicSettings(latestSettings || null);
      return latestSettings || null;
    } finally {
      setIsLoadingPublicSettings(false);
    }
  };

  const syncSession = async (candidateUsers = null) => {
    const list = candidateUsers || await refreshUsers();
    const session = await loadSessionRecord();
    if (!session) {
      setUser(null);
      setIsAuthenticated(false);
      setAppPublicSettings(null);
      setIsLoadingPublicSettings(false);
      return;
    }

    if (session.spectator_mode || session.role === 'spectator') {
      setUser({ id: 'spectator', role: 'spectator', email: 'spectator@local' });
      setIsAuthenticated(true);
      setAuthError(null);
      setAppPublicSettings(null);
      setIsLoadingPublicSettings(false);
      return;
    }

    const sessionUserId = session.user_id || session.userId || null;
    if (!sessionUserId) {
      setUser(null);
      setIsAuthenticated(false);
      setAppPublicSettings(null);
      setIsLoadingPublicSettings(false);
      return;
    }

    const found = list.find((item) => item.id === sessionUserId) || null;
    if (!found) {
      await clearSessionRecord();
      setUser(null);
      setIsAuthenticated(false);
      setAuthError({ type: 'user_not_registered' });
      setAppPublicSettings(null);
      setIsLoadingPublicSettings(false);
      return;
    }

    if (isSubscriptionExpired(found)) {
      await clearSessionRecord();
      setUser(null);
      setIsAuthenticated(false);
      setAuthError({ type: 'subscription_expired', user: found });
      setAppPublicSettings(null);
      setIsLoadingPublicSettings(false);
      return;
    }

    setUser(found);
    setIsAuthenticated(true);
    setAuthError(null);
    await refreshPublicSettings(found.id, found.email);
  };

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const initialUsers = await loadInitialUsers();
        if (cancelled) return;
        setUsers(initialUsers);
        await syncSession(initialUsers);
      } catch (error) {
        console.error('Failed to load auth users:', error);
        if (!cancelled) {
          setAuthError({ type: 'auth_load_failed', error });
          const fallbackUsers = [createAdminUser()];
          await persistUsers(fallbackUsers);
          setUsers(fallbackUsers);
          setAppPublicSettings(null);
          setIsLoadingPublicSettings(false);
        }
      } finally {
        if (!cancelled) setIsLoadingAuth(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!user || user.id === 'spectator') return;

    const refreshed = users.find((item) => item.id === user.id) || null;
    if (!refreshed) {
      void clearSessionRecord();
      setUser(null);
      setIsAuthenticated(false);
      setAuthError({ type: 'user_not_registered' });
      setAppPublicSettings(null);
      setIsLoadingPublicSettings(false);
      return;
    }

    if (isSubscriptionExpired(refreshed)) {
      void clearSessionRecord();
      setUser(null);
      setIsAuthenticated(false);
      setAuthError({ type: 'subscription_expired', user: refreshed });
      setAppPublicSettings(null);
      setIsLoadingPublicSettings(false);
      return;
    }

    if (refreshed !== user) {
      setUser(refreshed);
    }
  }, [users, user]);

  const login = async ({ email, password }) => {
    const list = await refreshUsers();
    const normalizedEmail = normalizeEmail(email);

    if (!isValidEmail(normalizedEmail)) {
      throw new Error('Email inválido.');
    }

    const found = list.find(
      (item) => String(item.email || '').toLowerCase() === normalizedEmail && item.password === password,
    );

    if (!found) {
      throw createTaggedError('Email ou senha inválidos.', 'invalid_credentials');
    }

    if (isSubscriptionExpired(found)) {
      await clearSessionRecord();
      clearTrackedNavigationPaths();
      setUser(null);
      setIsAuthenticated(false);
      setAuthError({ type: 'subscription_expired', user: found });
      throw createTaggedError('Login expirado. Para continuar usando, renove a assinatura.', 'subscription_expired');
    }

    await persistSessionRecord({ user_id: found.id, user_email: found.email, spectator_mode: false });
    clearTrackedNavigationPaths();
    setUser(found);
    setIsAuthenticated(true);
    setAuthError(null);
    await refreshPublicSettings(found.id, found.email);
    return found;
  };

  const logout = async () => {
    await clearSessionRecord();
    clearTrackedNavigationPaths();
    setUser(null);
    setIsAuthenticated(false);
    setAuthError(null);
    setAppPublicSettings(null);
    setIsLoadingPublicSettings(false);
  };

  const enterSpectatorMode = async () => {
    await persistSessionRecord({ user_id: null, user_email: 'spectator@local', spectator_mode: true, role: 'spectator' });
    clearTrackedNavigationPaths();
    setUser({ id: 'spectator', role: 'spectator', email: 'spectator@local' });
    setIsAuthenticated(true);
    setAuthError(null);
    setAppPublicSettings(null);
    setIsLoadingPublicSettings(false);
  };

  const createUser = async (payload) => {
    const list = await refreshUsers();
    const email = normalizeEmail(payload.email);

    if (!email) throw new Error('Email é obrigatório.');
    if (!isValidEmail(email)) throw new Error('Email inválido.');
    if (list.some((item) => String(item.email || '').toLowerCase() === email)) {
      throw new Error('Já existe um usuário com este email.');
    }

    const password = String(payload.password || '').trim();
    if (!isStrongPassword(password)) {
      throw new Error('A senha deve ter no mínimo 8 caracteres, incluindo maiúscula, minúscula, número e símbolo.');
    }

    const validityAmount = normalizeValidityAmount(
      payload.subscription_validity_amount ?? payload.validity_amount,
      DEFAULT_NEW_USER_VALIDITY.amount,
    );
    const validityUnit = normalizeValidityUnit(
      payload.subscription_validity_unit ?? payload.validity_unit,
      DEFAULT_NEW_USER_VALIDITY.unit,
    );

  const created = {
      id: newId(),
      first_name: String(payload.first_name || '').trim(),
      last_name: String(payload.last_name || '').trim(),
      phone: String(payload.phone || '').trim(),
      email,
      password,
      force_password_change: true,
      role: payload.role === 'admin' ? 'admin' : payload.role === 'torneio' ? 'torneio' : 'user',
      created_at: new Date().toISOString(),
      ...buildSubscriptionTerms({
        amount: validityAmount,
        unit: validityUnit,
        neverExpires: Boolean(payload.never_expires),
        startAt: new Date(),
      }),
    };

    const next = [...list, created];
    setUsers(next);
    await persistUsers(next);
    return created;
  };

  const updateUserRole = async (userId, role) => {
    const list = await refreshUsers();
    const next = list.map((item) => (
      item.id === userId ? { ...item, role: role === 'admin' ? 'admin' : role === 'torneio' ? 'torneio' : 'user' } : item
    ));

    setUsers(next);
    await persistUsers(next);

    if (user?.id === userId) {
      const refreshed = next.find((item) => item.id === userId);
      setUser(refreshed || null);
    }
  };

  const updateUserValidity = async (userId, payload) => {
    const neverExpires = Boolean(payload.never_expires);
    const validityAmount = normalizeValidityAmount(
      payload.subscription_validity_amount ?? payload.validity_amount,
      DEFAULT_NEW_USER_VALIDITY.amount,
    );
    const validityUnit = normalizeValidityUnit(
      payload.subscription_validity_unit ?? payload.validity_unit,
      DEFAULT_NEW_USER_VALIDITY.unit,
    );

    const list = await refreshUsers();
    const next = list.map((item) => {
      if (item.id !== userId) return item;

      const currentExpired = isSubscriptionExpired(item);
      return {
        ...item,
        subscription_validity_amount: validityAmount,
        subscription_validity_unit: validityUnit,
        subscription_never_expires: neverExpires,
        subscription_expires_at: buildSubscriptionTerms({
          amount: validityAmount,
          unit: validityUnit,
          neverExpires,
          startAt: new Date(),
        }).subscription_expires_at,
        subscription_status: neverExpires ? 'active' : (currentExpired ? 'expired' : 'active'),
      };
    });

    setUsers(next);
    await persistUsers(next);

    if (user?.id === userId) {
      const refreshed = next.find((item) => item.id === userId) || null;
      if (refreshed && !isSubscriptionExpired(refreshed)) {
        setUser(refreshed);
      }
    }
  };

  const expireUser = async (userId) => {
    const list = await refreshUsers();
    const next = list.map((item) => (
      item.id === userId
        ? {
          ...item,
          subscription_status: 'expired',
          subscription_never_expires: false,
          subscription_expires_at: new Date().toISOString(),
        }
        : item
    ));

    setUsers(next);
    await persistUsers(next);

    if (user?.id === userId) {
      void clearSessionRecord();
      setUser(null);
      setIsAuthenticated(false);
      setAuthError({ type: 'subscription_expired', user: next.find((item) => item.id === userId) || null });
      setAppPublicSettings(null);
      setIsLoadingPublicSettings(false);
    }
  };

  const reactivateUser = async (userId) => {
    const list = await refreshUsers();
    const next = list.map((item) => {
      if (item.id !== userId) return item;

      const validityAmount = normalizeValidityAmount(
        item.subscription_validity_amount,
        DEFAULT_NEW_USER_VALIDITY.amount,
      );
      const validityUnit = normalizeValidityUnit(
        item.subscription_validity_unit,
        DEFAULT_NEW_USER_VALIDITY.unit,
      );

      return {
        ...item,
        subscription_status: 'active',
        subscription_validity_amount: validityAmount,
        subscription_validity_unit: validityUnit,
        subscription_expires_at: item.subscription_never_expires
          ? null
          : buildSubscriptionTerms({
            amount: validityAmount,
            unit: validityUnit,
            neverExpires: false,
            startAt: new Date(),
          }).subscription_expires_at,
      };
    });

    setUsers(next);
    await persistUsers(next);

    if (user?.id === userId) {
      const refreshed = next.find((item) => item.id === userId) || null;
      if (refreshed) {
        await persistSessionRecord({ user_id: refreshed.id, user_email: refreshed.email, spectator_mode: false });
        setUser(refreshed);
        setIsAuthenticated(true);
        setAuthError(null);
        await refreshPublicSettings(refreshed.id, refreshed.email);
      }
    }
  };

  const resetUserPassword = async (userId, newPassword) => {
    const password = String(newPassword || '').trim();
    if (!isStrongPassword(password)) {
      throw new Error('A senha deve ter no mínimo 8 caracteres, incluindo maiúscula, minúscula, número e símbolo.');
    }

    const list = await refreshUsers();
    const next = list.map((item) => (
      item.id === userId ? { ...item, password, force_password_change: true } : item
    ));

    setUsers(next);
    await persistUsers(next);
  };

  const changeOwnPassword = async (newPassword) => {
    const password = String(newPassword || '').trim();
    if (!isStrongPassword(password)) {
      throw new Error('A senha deve ter no mínimo 8 caracteres, incluindo maiúscula, minúscula, número e símbolo.');
    }
    if (!user?.id) throw new Error('Usuário não autenticado.');

    const list = await refreshUsers();
    const next = list.map((item) => (
      item.id === user.id ? { ...item, password, force_password_change: false } : item
    ));

    setUsers(next);
    await persistUsers(next);

    const refreshed = next.find((item) => item.id === user.id) || null;
    setUser(refreshed);
  };

  const deleteUser = async (targetUserId) => {
    const list = await refreshUsers();
    const target = list.find((item) => item.id === targetUserId);
    if (!target) throw new Error('Usuário não encontrado.');

    const isSelf = user?.id === targetUserId;
    const currentUserIsAdmin = user?.role === 'admin';
    if (isSelf && currentUserIsAdmin) {
      throw new Error('Administrador não pode deletar a própria conta.');
    }

    const next = list.filter((item) => item.id !== targetUserId);
    setUsers(next);
    await persistUsers(next, { deleteIds: [targetUserId] });

    if (isSelf) {
      await clearSessionRecord();
      setUser(null);
      setIsAuthenticated(false);
      setAuthError(null);
      setAppPublicSettings(null);
      setIsLoadingPublicSettings(false);
    }
  };

  const value = useMemo(() => ({
    user,
    users,
    isAuthenticated,
    isLoadingAuth,
    authError,
    isLoadingPublicSettings,
    authChecked: !isLoadingAuth,
    appPublicSettings,
    login,
    enterSpectatorMode,
    logout,
    createUser,
    updateUserRole,
    updateUserValidity,
    expireUser,
    reactivateUser,
    resetUserPassword,
    changeOwnPassword,
    deleteUser,
    refreshUsers,
    isAdmin: user?.role === 'admin',
    isTournament: user?.role === 'torneio',
    isSpectator: user?.role === 'spectator',
    mustChangePassword: !!user?.force_password_change,
    navigateToLogin: () => undefined,
    checkAppState: async () => undefined,
    checkUserAuth: async () => syncSession(await refreshUsers()),
  }), [user, users, isAuthenticated, isLoadingAuth, isLoadingPublicSettings, authError, appPublicSettings]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
