import React, { useEffect, useMemo, useState } from 'react';
import { UserPlus, Users, KeyRound, X, Trash2, CalendarDays, Info, Mail, Phone, ShieldCheck, Archive, RotateCcw, RefreshCw, HardDrive } from 'lucide-react';
import { Navigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { useAuth } from '@/lib/AuthContext';
import { useI18n } from '@/lib/i18n';
import { COUNTRY_DIAL_CODES } from '@/lib/countryDialCodes';
import LanguageSelector from '@/components/LanguageSelector';
import { createUsersBackup, deleteManyUserBackups, deleteUserBackup, loadUserBackups, restoreUsersBackup } from '@/services/usersRepository';
import { createSystemBackup, deleteManySystemBackups, deleteSystemBackup, loadSystemBackups, restoreSystemBackup } from '@/services/systemBackupRepository';
import {
  DEFAULT_NEW_USER_VALIDITY,
  formatSubscriptionDate,
  isSubscriptionExpired,
  normalizeValidityAmount,
  normalizeValidityUnit,
} from '@/lib/subscription';
import PageShell from '@/components/PageShell';

const INITIAL_FORM = {
  first_name: '',
  last_name: '',
  phone_country: 'BR',
  phone_local: '',
  email: '',
  password: '',
  confirm_password: '',
  role: 'user',
  validity_amount: DEFAULT_NEW_USER_VALIDITY.amount,
  validity_unit: DEFAULT_NEW_USER_VALIDITY.unit,
  never_expires: false,
};

function SectionHeader({ icon: Icon, title, hint }) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#2a2a4a] bg-[#16213e] text-[#6ee7df]">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <h4 className="text-sm font-semibold uppercase tracking-[0.18em] text-gray-300">{title}</h4>
        {hint ? <p className="mt-1 flex items-start gap-1 text-xs leading-relaxed text-gray-400"><Info className="mt-0.5 h-3 w-3 shrink-0" />{hint}</p> : null}
      </div>
    </div>
  );
}

export default function AdminSystem() {
  const {
    user,
    isAdmin,
    isSpectator,
    users,
    createUser,
    updateUserRole,
    updateUserValidity,
    expireUser,
    reactivateUser,
    resetUserPassword,
    changeOwnPassword,
    deleteUser,
    refreshUsers,
    checkUserAuth,
    logout,
  } = useAuth();
  const { language, setLanguage, t } = useI18n();
  const [form, setForm] = useState(INITIAL_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showInitialPassword, setShowInitialPassword] = useState(false);
  const [passwordModalUser, setPasswordModalUser] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [resetError, setResetError] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [validityModalUser, setValidityModalUser] = useState(null);
  const [validityForm, setValidityForm] = useState({
    validity_amount: DEFAULT_NEW_USER_VALIDITY.amount,
    validity_unit: DEFAULT_NEW_USER_VALIDITY.unit,
    never_expires: false,
  });
  const [validitySaving, setValiditySaving] = useState(false);
  const [validityError, setValidityError] = useState('');
  const [showCreateUserModal, setShowCreateUserModal] = useState(false);
  const [showUsersModal, setShowUsersModal] = useState(false);
  const [showBackupsModal, setShowBackupsModal] = useState(false);
  const [backups, setBackups] = useState([]);
  const [backupsLoading, setBackupsLoading] = useState(false);
  const [backupsError, setBackupsError] = useState('');
  const [backupSaving, setBackupSaving] = useState(false);
  const [restoringBackupId, setRestoringBackupId] = useState('');
  const [selectedBackupIds, setSelectedBackupIds] = useState([]);
  const [showSystemBackupsModal, setShowSystemBackupsModal] = useState(false);
  const [systemBackups, setSystemBackups] = useState([]);
  const [systemBackupsLoading, setSystemBackupsLoading] = useState(false);
  const [systemBackupsError, setSystemBackupsError] = useState('');
  const [systemBackupSaving, setSystemBackupSaving] = useState(false);
  const [restoringSystemBackupId, setRestoringSystemBackupId] = useState('');
  const [selectedSystemBackupIds, setSelectedSystemBackupIds] = useState([]);

  const selectedCountry = useMemo(
    () => COUNTRY_DIAL_CODES.find((c) => c.code === form.phone_country) || COUNTRY_DIAL_CODES[0],
    [form.phone_country],
  );
  const selectedDialPrefix = `${selectedCountry.dialCode} `;

  if (isSpectator) {
    return <Navigate to={createPageUrl('SpectatorHub')} replace />;
  }

  if (!isAdmin) {
    return <Navigate to={createPageUrl('SpeedMeter')} replace />;
  }

  const visibleUsers = isAdmin ? users : users.filter((u) => u.id === user?.id);
  const userActionButtonClass = 'inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl px-3 text-sm font-medium transition-colors';

  const refreshBackups = async () => {
    setBackupsLoading(true);
    setBackupsError('');
    try {
      const list = await loadUserBackups(6);
      setBackups(Array.isArray(list) ? list : []);
      setSelectedBackupIds((prev) => prev.filter((id) => (Array.isArray(list) ? list.some((backup) => backup.id === id) : false)));
    } catch (err) {
      setBackups([]);
      setSelectedBackupIds([]);
      setBackupsError(err?.message || t('backupLoadFailed'));
    } finally {
      setBackupsLoading(false);
    }
  };

  const refreshSystemBackups = async () => {
    setSystemBackupsLoading(true);
    setSystemBackupsError('');
    try {
      const list = await loadSystemBackups(6);
      setSystemBackups(Array.isArray(list) ? list : []);
      setSelectedSystemBackupIds((prev) => prev.filter((id) => (Array.isArray(list) ? list.some((backup) => backup.id === id) : false)));
    } catch (err) {
      setSystemBackups([]);
      setSelectedSystemBackupIds([]);
      setSystemBackupsError(err?.message || t('systemBackupLoadFailed'));
    } finally {
      setSystemBackupsLoading(false);
    }
  };

  const openBackupsModal = async () => {
    setShowBackupsModal(true);
    setSelectedBackupIds([]);
    await refreshBackups();
  };

  const openSystemBackupsModal = async () => {
    setShowSystemBackupsModal(true);
    setSelectedSystemBackupIds([]);
    await refreshSystemBackups();
  };

  useEffect(() => {
    if (!isAdmin) return undefined;
    refreshBackups();
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  const openValidityModal = (targetUser) => {
    setValidityModalUser(targetUser);
    setValidityForm({
      validity_amount: normalizeValidityAmount(targetUser?.subscription_validity_amount, DEFAULT_NEW_USER_VALIDITY.amount),
      validity_unit: normalizeValidityUnit(targetUser?.subscription_validity_unit, DEFAULT_NEW_USER_VALIDITY.unit),
      never_expires: Boolean(targetUser?.subscription_never_expires),
    });
    setValidityError('');
  };

  const closeValidityModal = () => {
    setValidityModalUser(null);
    setValidityError('');
    setValiditySaving(false);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (form.password !== form.confirm_password) {
        throw new Error('As senhas não coincidem.');
      }
      const phone = form.phone_local.trim();
      await createUser({
        first_name: form.first_name,
        last_name: form.last_name,
        phone,
        email: form.email,
        password: form.password,
        role: form.role,
        validity_amount: form.validity_amount,
        validity_unit: form.validity_unit,
        never_expires: form.never_expires,
      });
      setForm(INITIAL_FORM);
      setShowCreateUserModal(false);
    } catch (err) {
      setError(err?.message || t('createUserFailed'));
    } finally {
      setSaving(false);
    }
  };

  const openResetModal = (targetUser) => {
    setPasswordModalUser(targetUser);
    setNewPassword('');
    setConfirmNewPassword('');
    setShowResetPassword(false);
    setResetError('');
  };

  const handleResetPassword = async () => {
    if (!passwordModalUser) return;
    setResetLoading(true);
    setResetError('');
    try {
      if (newPassword !== confirmNewPassword) {
        throw new Error('As senhas não coincidem.');
      }
      if (passwordModalUser.id === user?.id) {
        await changeOwnPassword(newPassword);
      } else {
        await resetUserPassword(passwordModalUser.id, newPassword);
      }
      setPasswordModalUser(null);
      setNewPassword('');
      setConfirmNewPassword('');
    } catch (err) {
      setResetError(err?.message || 'Falha ao redefinir senha.');
    } finally {
      setResetLoading(false);
    }
  };

  const handleUpdateValidity = async () => {
    if (!validityModalUser) return;
    setValiditySaving(true);
    setValidityError('');
    try {
      await updateUserValidity(validityModalUser.id, {
        validity_amount: validityForm.validity_amount,
        validity_unit: validityForm.validity_unit,
        never_expires: validityForm.never_expires,
      });
      closeValidityModal();
    } catch (err) {
      setValidityError(err?.message || 'Falha ao atualizar a validade.');
      setValiditySaving(false);
    }
  };

  const handleCreateBackup = async () => {
    setBackupSaving(true);
    setBackupsError('');
    try {
      const backup = await createUsersBackup(users, {
        reason: 'manual_admin',
        source: 'AdminSystem',
      });
      if (!backup) {
        throw new Error(t('backupCreateFailed'));
      }
      await refreshBackups();
    } catch (err) {
      setBackupsError(err?.message || t('backupCreateFailed'));
    } finally {
      setBackupSaving(false);
    }
  };

  const handleCreateSystemBackup = async () => {
    setSystemBackupSaving(true);
    setSystemBackupsError('');
    try {
      const backup = await createSystemBackup({
        reason: 'manual_admin',
        source: 'AdminSystem',
      });
      if (!backup) {
        throw new Error(t('systemBackupCreateFailed'));
      }
      await refreshSystemBackups();
    } catch (err) {
      setSystemBackupsError(err?.message || t('systemBackupCreateFailed'));
    } finally {
      setSystemBackupSaving(false);
    }
  };

  const toggleBackupSelection = (backupId) => {
    if (!backupId) return;
    setSelectedBackupIds((prev) => (
      prev.includes(backupId)
        ? prev.filter((id) => id !== backupId)
        : [...prev, backupId]
    ));
  };

  const toggleAllBackupsSelection = () => {
    if (!backups.length) return;
    setSelectedBackupIds((prev) => (prev.length === backups.length ? [] : backups.map((backup) => backup.id)));
  };

  const handleDeleteBackup = async (backup) => {
    if (!backup) return;
    const confirmDelete = window.confirm(t('deleteBackupConfirm'));
    if (!confirmDelete) return;

    setBackupsError('');
    try {
      const deleted = await deleteUserBackup(backup.id);
      if (!deleted) {
        throw new Error(t('backupDeleteFailed'));
      }
      setSelectedBackupIds((prev) => prev.filter((id) => id !== backup.id));
      await refreshBackups();
    } catch (err) {
      setBackupsError(err?.message || t('backupDeleteFailed'));
    }
  };

  const handleDeleteSelectedBackups = async () => {
    if (!selectedBackupIds.length) return;
    const confirmDelete = window.confirm(t('deleteSelectedBackupsConfirm'));
    if (!confirmDelete) return;

    setBackupsError('');
    try {
      const deleted = await deleteManyUserBackups(selectedBackupIds);
      if (!deleted) {
        throw new Error(t('backupDeleteFailed'));
      }
      setSelectedBackupIds([]);
      await refreshBackups();
    } catch (err) {
      setBackupsError(err?.message || t('backupDeleteFailed'));
    }
  };

  const handleRestoreBackup = async (backup) => {
    if (!backup) return;
    const confirmRestore = window.confirm(t('restoreBackupConfirm'));
    if (!confirmRestore) return;

    setRestoringBackupId(backup.id);
    setBackupsError('');
    try {
      const restored = await restoreUsersBackup(backup.id, {
        createSafetyBackup: true,
        reason: 'manual_restore',
        source: 'AdminSystem',
      });
      if (!restored) {
        throw new Error(t('backupRestoreFailed'));
      }
      await refreshBackups();
      await refreshUsers();
      await checkUserAuth();
    } catch (err) {
      setBackupsError(err?.message || t('backupRestoreFailed'));
    } finally {
      setRestoringBackupId('');
    }
  };

  const toggleSystemBackupSelection = (backupId) => {
    if (!backupId) return;
    setSelectedSystemBackupIds((prev) => (
      prev.includes(backupId)
        ? prev.filter((id) => id !== backupId)
        : [...prev, backupId]
    ));
  };

  const toggleAllSystemBackupsSelection = () => {
    if (!systemBackups.length) return;
    setSelectedSystemBackupIds((prev) => (prev.length === systemBackups.length ? [] : systemBackups.map((backup) => backup.id)));
  };

  const handleDeleteSystemBackup = async (backup) => {
    if (!backup) return;
    const confirmDelete = window.confirm(t('deleteSystemBackupConfirm'));
    if (!confirmDelete) return;

    setSystemBackupsError('');
    try {
      const deleted = await deleteSystemBackup(backup.id);
      if (!deleted) {
        throw new Error(t('systemBackupDeleteFailed'));
      }
      setSelectedSystemBackupIds((prev) => prev.filter((id) => id !== backup.id));
      await refreshSystemBackups();
    } catch (err) {
      setSystemBackupsError(err?.message || t('systemBackupDeleteFailed'));
    }
  };

  const handleDeleteSelectedSystemBackups = async () => {
    if (!selectedSystemBackupIds.length) return;
    const confirmDelete = window.confirm(t('deleteSelectedSystemBackupsConfirm'));
    if (!confirmDelete) return;

    setSystemBackupsError('');
    try {
      const deleted = await deleteManySystemBackups(selectedSystemBackupIds);
      if (!deleted) {
        throw new Error(t('systemBackupDeleteFailed'));
      }
      setSelectedSystemBackupIds([]);
      await refreshSystemBackups();
    } catch (err) {
      setSystemBackupsError(err?.message || t('systemBackupDeleteFailed'));
    }
  };

  const handleRestoreSystemBackup = async (backup) => {
    if (!backup) return;
    const confirmRestore = window.confirm(t('restoreSystemBackupConfirm'));
    if (!confirmRestore) return;

    setRestoringSystemBackupId(backup.id);
    setSystemBackupsError('');
    try {
      const restored = await restoreSystemBackup(backup.id, {
        createSafetyBackup: true,
        reason: 'admin_restore',
        source: 'AdminSystem',
      });
      if (!restored) {
        throw new Error(t('systemBackupRestoreFailed'));
      }
      await refreshSystemBackups();
      await refreshUsers();
    } catch (err) {
      setSystemBackupsError(err?.message || t('systemBackupRestoreFailed'));
    } finally {
      setRestoringSystemBackupId('');
    }
  };

  return (
    <PageShell
      title={t('systemAdmin')}
      backTo={createPageUrl('SpeedMeter')}
      contentClassName="pt-4"
    >
      <div className="max-w-2xl mx-auto space-y-6">
        {isAdmin && (
          <div className="bg-[#16213e] rounded-2xl p-6 border border-[#2a2a4a] space-y-4">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-3">
                <UserPlus className="w-6 h-6 text-[#0f9b8e]" />
                <div>
                  <h2 className="text-xl font-bold">{t('newRegistration')}</h2>
                  <p className="text-sm text-gray-400">{t('adminRegistrationDesc')}</p>
                </div>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={() => {
                    setForm(INITIAL_FORM);
                    setError('');
                    setShowCreateUserModal(true);
                  }}
                  className="h-11 px-4 rounded-full bg-[#e94560] hover:bg-[#c73e54] font-semibold"
                >
                  {t('createShort')}
                </button>
                <button
                  type="button"
                  onClick={() => setShowUsersModal(true)}
                  className="h-11 px-4 rounded-full bg-[#2a2a4a] hover:bg-[#3a3a5a] font-semibold"
                >
                  {t('usersShort')}
                </button>
              </div>
            </div>
          </div>
        )}

        {isAdmin && (
          <div className="bg-[#16213e] rounded-2xl p-6 border border-[#2a2a4a] space-y-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-3">
                <Archive className="h-6 w-6 text-[#0f9b8e]" />
                <div>
                  <h2 className="text-xl font-bold">{t('backupSectionTitle')}</h2>
                  <p className="text-sm text-gray-400">{t('backupSectionHint')}</p>
                </div>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={handleCreateBackup}
                  disabled={backupSaving}
                  className="h-11 px-4 rounded-full bg-[#0f9b8e] hover:bg-[#0d847a] font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {backupSaving ? t('saving') : t('createBackupNow')}
                </button>
                <button
                  type="button"
                  onClick={openBackupsModal}
                  disabled={backupsLoading}
                  className="h-11 px-4 rounded-full bg-[#2a2a4a] hover:bg-[#3a3a5a] font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {t('viewBackups')}
                </button>
              </div>
            </div>

            <p className="text-xs text-gray-500">{t('backupSafetyNote')}</p>

            {backupsError ? <p className="text-sm text-red-400">{backupsError}</p> : null}
          </div>
        )}

        {isAdmin && (
          <div className="bg-[#16213e] rounded-2xl p-6 border border-[#2a2a4a] space-y-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-3">
                <HardDrive className="h-6 w-6 text-[#f5b942]" />
                <div>
                  <h2 className="text-xl font-bold">{t('systemBackupSectionTitle')}</h2>
                  <p className="text-sm text-gray-400">{t('systemBackupSectionHint')}</p>
                </div>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={handleCreateSystemBackup}
                  disabled={systemBackupSaving}
                  className="h-11 px-4 rounded-full bg-[#f5b942] text-[#0d0d1a] hover:bg-[#f0ab1f] font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {systemBackupSaving ? t('saving') : t('createSystemBackupNow')}
                </button>
                <button
                  type="button"
                  onClick={openSystemBackupsModal}
                  disabled={systemBackupsLoading}
                  className="h-11 px-4 rounded-full bg-[#2a2a4a] hover:bg-[#3a3a5a] font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {t('viewSystemBackups')}
                </button>
              </div>
            </div>

            <p className="text-xs text-gray-500">{t('systemBackupSafetyNote')}</p>

            {systemBackupsError ? <p className="text-sm text-red-400">{systemBackupsError}</p> : null}
          </div>
        )}

        {isAdmin && (
          <LanguageSelector value={language} onChange={setLanguage} />
        )}
      {showUsersModal && isAdmin && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 px-3 py-4 sm:px-4 sm:py-6">
          <div className="mx-auto w-full max-w-4xl rounded-3xl border border-[#2a2a4a] bg-[#16213e] p-4 shadow-2xl sm:p-5 md:p-6">
            <div className="mb-5 flex items-start justify-between gap-3 sm:mb-6">
              <div className="min-w-0">
                <h3 className="text-2xl font-bold">{t('createdUsers')}</h3>
                <p className="text-sm text-gray-400">{t('createdUsersDesc')}</p>
              </div>
              <button onClick={() => setShowUsersModal(false)} className="rounded-full bg-[#2a2a4a] p-2 hover:bg-[#3a3a5a]">
                <X className="h-5 w-5 text-gray-300" />
              </button>
            </div>

            <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
              {visibleUsers.map((u) => (
                <div key={u.id} className="bg-[#0d0d1a] border border-[#2a2a4a] rounded-2xl p-3 sm:p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-semibold text-base">{u.first_name} {u.last_name}</p>
                      <p className="text-sm text-gray-400">{u.email}</p>
                      <p className="text-sm text-gray-500">{u.phone || t('noContact')}</p>
                    </div>
                    <div className="flex w-full flex-col gap-2 text-xs sm:min-w-0 sm:flex-1 sm:flex-row sm:justify-end sm:text-right">
                      <div className="flex h-11 w-full items-center justify-between rounded-xl border border-[#2a2a4a] bg-[#16213e] px-3 sm:w-[220px]">
                        <p className="text-gray-400">{t('expiresAt')}:</p>
                        <p className="font-semibold leading-none text-white">
                          {u.subscription_never_expires ? t('neverExpires') : formatSubscriptionDate(u.subscription_expires_at)}
                        </p>
                      </div>
                      <div className="flex h-11 w-full items-center justify-between rounded-xl border border-[#2a2a4a] bg-[#16213e] px-3 sm:w-[220px]">
                        <p className="text-gray-400">{t('validityLabel')}:</p>
                        <p className="font-semibold leading-none text-white">
                          {u.subscription_never_expires
                            ? t('neverExpires')
                            : `${normalizeValidityAmount(u.subscription_validity_amount, DEFAULT_NEW_USER_VALIDITY.amount)} ${
                                t(normalizeValidityUnit(u.subscription_validity_unit, DEFAULT_NEW_USER_VALIDITY.unit) === 'days'
                                  ? 'validityDays'
                                  : normalizeValidityUnit(u.subscription_validity_unit, DEFAULT_NEW_USER_VALIDITY.unit) === 'months'
                                    ? 'validityMonths'
                                    : 'validityYears')
                              }`}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <div className={`${userActionButtonClass} justify-start gap-2 bg-[#16213e] border border-[#2a2a4a]`}>
                      <span className="text-gray-400">{t('subscriptionStatus')}:</span>
                      <span className={`font-semibold ${isSubscriptionExpired(u) ? 'text-red-300' : 'text-emerald-300'}`}>
                        {u.subscription_never_expires ? t('neverExpires') : (isSubscriptionExpired(u) ? t('expiredStatus') : t('activeStatus'))}
                      </span>
                    </div>
                    <div className="flex h-11 items-center justify-center gap-6 rounded-xl border border-[#2a2a4a] bg-[#2a2a4a] px-3 text-sm font-medium text-white">
                      <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg px-2 py-1 transition-colors hover:bg-white/5">
                        <input
                          type="checkbox"
                          checked={u.role === 'admin'}
                          onChange={() => updateUserRole(u.id, 'admin')}
                          className="h-4 w-4 rounded border-gray-400 bg-transparent text-[#0f9b8e] focus:ring-[#0f9b8e]"
                        />
                        <span>{t('roleAdmin')}</span>
                      </label>
                      <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg px-2 py-1 transition-colors hover:bg-white/5">
                        <input
                          type="checkbox"
                          checked={u.role === 'torneio'}
                          onChange={() => updateUserRole(u.id, 'torneio')}
                          className="h-4 w-4 rounded border-gray-400 bg-transparent text-[#0f9b8e] focus:ring-[#0f9b8e]"
                        />
                        <span>{t('roleTournament')}</span>
                      </label>
                      <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg px-2 py-1 transition-colors hover:bg-white/5">
                        <input
                          type="checkbox"
                          checked={u.role === 'user'}
                          onChange={() => updateUserRole(u.id, 'user')}
                          className="h-4 w-4 rounded border-gray-400 bg-transparent text-[#0f9b8e] focus:ring-[#0f9b8e]"
                        />
                        <span>{t('roleUser')}</span>
                      </label>
                    </div>
                    <button onClick={() => openValidityModal(u)} className={`${userActionButtonClass} bg-[#2a2a4a] hover:bg-[#3a3a5a]`}>
                      {t('editValidity')}
                    </button>
                    <button
                      onClick={async () => {
                        try {
                          await expireUser(u.id);
                        } catch (err) {
                          alert(err?.message || t('expireUserFailed'));
                        }
                      }}
                      className={`${userActionButtonClass} bg-amber-700/80 hover:bg-amber-700`}
                    >
                      {t('expireUser')}
                    </button>
                    <button
                      onClick={async () => {
                        try {
                          await reactivateUser(u.id);
                        } catch (err) {
                          alert(err?.message || t('reactivateUserFailed'));
                        }
                      }}
                      className={`${userActionButtonClass} bg-emerald-700/80 hover:bg-emerald-700`}
                    >
                      {t('reactivateUser')}
                    </button>
                    <button onClick={() => openResetModal(u)} className={`${userActionButtonClass} bg-[#0f9b8e] hover:bg-[#0d847a]`}>
                      {t('resetPassword')}
                    </button>
                    <button
                      disabled={u.id === user?.id}
                      onClick={async () => {
                        const confirmDelete = window.confirm(t('confirmDeleteUser').replace('{email}', u.email));
                        if (!confirmDelete) return;
                        try {
                          await deleteUser(u.id);
                        } catch (err) {
                          alert(err?.message || t('deleteUserFailed'));
                        }
                      }}
                      className={`${userActionButtonClass} sm:col-span-2 bg-red-800/70 hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40`}
                    >
                      <span className="inline-flex items-center gap-1">
                        <Trash2 className="h-3 w-3" />
                        {t('deleteUser')}
                      </span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

        <button
          type="button"
          onClick={logout}
          className="w-full bg-red-800/70 hover:bg-red-700 text-white font-bold py-3 rounded-full transition-colors"
        >
          {t('logout')}
        </button>
      </div>

      {showCreateUserModal && isAdmin && (
        <div className="fixed inset-0 z-50 bg-black/75 px-3 py-4 sm:px-4 sm:py-6 overflow-y-auto">
          <div className="mx-auto max-w-3xl rounded-3xl border border-[#2a2a4a] bg-[#16213e] p-4 shadow-2xl sm:p-5 md:p-6">
            <div className="mb-5 flex items-start justify-between gap-3 sm:mb-6">
              <div className="min-w-0">
                <h3 className="text-2xl font-bold">{t('newRegistration')}</h3>
                <p className="text-sm text-gray-400">{t('adminFormDesc')}</p>
              </div>
              <button onClick={() => setShowCreateUserModal(false)} className="rounded-full bg-[#2a2a4a] p-2 hover:bg-[#3a3a5a]">
                <X className="h-5 w-5 text-gray-300" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4 sm:space-y-5">
              <section className="space-y-3 rounded-2xl border border-[#2a2a4a] bg-[#0d0d1a] p-3 sm:p-4">
                <SectionHeader
                  icon={Mail}
                  title={t('createSection1Title')}
                  hint={t('createSection1Hint')}
                />
                <div className="grid gap-2 sm:gap-3">
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    <input
                      placeholder={t('firstName')}
                      value={form.first_name}
                      onChange={(e) => setForm((p) => ({ ...p, first_name: e.target.value }))}
                      required
                      className="h-10 rounded-xl border border-[#3a3a5a] bg-[#16213e] px-3 sm:h-11"
                    />
                    <input
                      placeholder={t('lastName')}
                      value={form.last_name}
                      onChange={(e) => setForm((p) => ({ ...p, last_name: e.target.value }))}
                      required
                      className="h-10 rounded-xl border border-[#3a3a5a] bg-[#16213e] px-3 sm:h-11"
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-12">
                    <select
                      value={form.phone_country}
                      onChange={(e) => {
                        const newCountry = COUNTRY_DIAL_CODES.find((c) => c.code === e.target.value) || COUNTRY_DIAL_CODES[0];
                        const newPrefix = `${newCountry.dialCode} `;
                        setForm((p) => {
                          const current = String(p.phone_local || '').trim();
                          if (!current) {
                            return { ...p, phone_country: e.target.value, phone_local: newPrefix };
                          }
                          const withoutPrefix = current.replace(/^\+\d+[-\d]*\s*/, '').trim();
                          return {
                            ...p,
                            phone_country: e.target.value,
                            phone_local: `${newPrefix}${withoutPrefix}`,
                          };
                        });
                      }}
                      className="h-10 rounded-xl border border-[#3a3a5a] bg-[#16213e] px-2 text-sm sm:h-11 sm:col-span-4 md:col-span-3"
                    >
                      {COUNTRY_DIAL_CODES.map((country) => (
                        <option key={country.code} value={country.code}>
                          {country.name} ({country.dialCode})
                        </option>
                      ))}
                    </select>
                    <input
                      placeholder={`${selectedCountry.code} ${selectedCountry.dialCode} ${t('phoneContact')}`}
                      value={form.phone_local || selectedDialPrefix}
                      onChange={(e) => {
                        const raw = e.target.value || '';
                        const currentPrefix = selectedDialPrefix;
                        let next = raw;
                        if (!next.startsWith(currentPrefix)) {
                          const stripped = next.replace(/^\+\d+[-\d]*\s*/, '').trimStart();
                          next = `${currentPrefix}${stripped}`;
                        }
                        if (next.length < currentPrefix.length) next = currentPrefix;
                        setForm((p) => ({ ...p, phone_local: next }));
                      }}
                      className="h-10 rounded-xl border border-[#3a3a5a] bg-[#16213e] px-3 sm:h-11 sm:col-span-8 md:col-span-9"
                    />
                  </div>
                  <input
                    placeholder="exemplo@exemplo.com"
                    type="email"
                    pattern="^[^\s@]+@[^\s@]+\.[^\s@]+$"
                    title="Use um email válido, por exemplo: exemplo@dominio.com"
                    value={form.email}
                    onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                    required
                    className="h-10 rounded-xl border border-[#3a3a5a] bg-[#16213e] px-3 sm:h-11"
                  />
                </div>
              </section>

              <section className="space-y-3 rounded-2xl border border-[#2a2a4a] bg-[#0d0d1a] p-3 sm:p-4">
                <SectionHeader
                  icon={ShieldCheck}
                  title={t('createSection2Title')}
                  hint={t('createSection2Hint')}
                />
                <div className="grid gap-2 sm:gap-3 md:grid-cols-2">
                  <select
                    value={form.role}
                    onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))}
                    className="h-10 rounded-xl border border-[#3a3a5a] bg-[#16213e] px-3 sm:h-11"
                  >
                    <option value="user">{t('roleUser')}</option>
                    <option value="admin">{t('roleAdmin')}</option>
                    <option value="torneio">{t('roleTournament')}</option>
                  </select>
                  <label className="flex items-center gap-2 text-sm text-gray-300 sm:justify-end">
                    <input
                      type="checkbox"
                      checked={showInitialPassword}
                      onChange={(e) => setShowInitialPassword(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-500 bg-[#0d0d1a]"
                    />
                    {t('showPassword')}
                  </label>
                  <input
                    placeholder={t('initialPassword')}
                    type={showInitialPassword ? 'text' : 'password'}
                    value={form.password}
                    onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                    className="h-10 rounded-xl border border-[#3a3a5a] bg-[#16213e] px-3 sm:h-11"
                  />
                  <input
                    placeholder={t('confirmPassword')}
                    type={showInitialPassword ? 'text' : 'password'}
                    value={form.confirm_password}
                    onChange={(e) => setForm((p) => ({ ...p, confirm_password: e.target.value }))}
                    className="h-10 rounded-xl border border-[#3a3a5a] bg-[#16213e] px-3 sm:h-11"
                  />
                </div>
              </section>

              <section className="space-y-3 rounded-2xl border border-[#2a2a4a] bg-[#0d0d1a] p-3 sm:p-4">
                <SectionHeader
                  icon={CalendarDays}
                  title={t('createSection3Title')}
                  hint={t('createSection3Hint')}
                />
                <div className="grid gap-2 sm:grid-cols-3 sm:gap-3">
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={form.validity_amount}
                    onChange={(e) => setForm((p) => ({
                      ...p,
                      validity_amount: Number.parseInt(e.target.value, 10) || DEFAULT_NEW_USER_VALIDITY.amount,
                    }))}
                    disabled={form.never_expires}
                    className="h-10 rounded-xl border border-[#3a3a5a] bg-[#16213e] px-3 sm:h-11"
                    placeholder={t('validityValue')}
                  />
                  <select
                    value={form.validity_unit}
                    onChange={(e) => setForm((p) => ({ ...p, validity_unit: e.target.value }))}
                    disabled={form.never_expires}
                    className="h-10 rounded-xl border border-[#3a3a5a] bg-[#16213e] px-3 sm:h-11 sm:col-span-2"
                  >
                    <option value="days">{t('validityDays')}</option>
                    <option value="months">{t('validityMonths')}</option>
                    <option value="years">{t('validityYears')}</option>
                  </select>
                </div>
                <label className="flex items-center gap-2 text-sm text-gray-300">
                  <input
                    type="checkbox"
                    checked={form.never_expires}
                    onChange={(e) => setForm((p) => ({ ...p, never_expires: e.target.checked }))}
                    className="h-4 w-4 rounded border-gray-500 bg-[#0d0d1a]"
                  />
                  {t('neverExpires')}
                </label>
              </section>

              {error ? <p className="text-sm text-red-400">{error}</p> : null}
              <p className="text-xs text-gray-500">{t('passwordRules')}</p>

              <div className="flex flex-col-reverse justify-end gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={() => setShowCreateUserModal(false)}
                  className="h-11 rounded-full bg-[#2a2a4a] px-5 hover:bg-[#3a3a5a]"
                >
                  {t('cancel')}
                </button>
                <button disabled={saving} type="submit" className="h-11 rounded-full bg-[#e94560] px-5 hover:bg-[#c73e54] disabled:opacity-60">
                {saving ? t('creatingUser') : t('createShort')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showBackupsModal && isAdmin && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 px-3 py-4 sm:px-4 sm:py-6">
          <div className="mx-auto w-full max-w-3xl rounded-3xl border border-[#2a2a4a] bg-[#16213e] p-4 shadow-2xl sm:p-5 md:p-6">
            <div className="mb-5 flex items-start justify-between gap-3 sm:mb-6">
              <div className="min-w-0">
                <h3 className="text-2xl font-bold">{t('backupsModalTitle')}</h3>
                <p className="text-sm text-gray-400">{t('backupsModalDesc')}</p>
              </div>
              <button onClick={() => setShowBackupsModal(false)} className="rounded-full bg-[#2a2a4a] p-2 hover:bg-[#3a3a5a]">
                <X className="h-5 w-5 text-gray-300" />
              </button>
            </div>

            <div className="mb-4 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={refreshBackups}
                disabled={backupsLoading}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#2a2a4a] px-4 font-semibold hover:bg-[#3a3a5a] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCw className={`h-4 w-4 ${backupsLoading ? 'animate-spin' : ''}`} />
                {t('refreshBackups')}
              </button>
              <button
                type="button"
                onClick={toggleAllBackupsSelection}
                disabled={backupsLoading || backups.length === 0}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#2a2a4a] px-4 font-semibold hover:bg-[#3a3a5a] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {selectedBackupIds.length === backups.length && backups.length > 0 ? t('unselectAll') : t('selectAll')}
              </button>
              <button
                type="button"
                onClick={handleDeleteSelectedBackups}
                disabled={backupsLoading || selectedBackupIds.length === 0}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#7c2235] px-4 font-semibold hover:bg-[#982946] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Trash2 className="h-4 w-4" />
                {t('deleteSelectedBackups')}
              </button>
            </div>

            {backupsError ? <p className="mb-4 text-sm text-red-400">{backupsError}</p> : null}

            <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
              {backupsLoading ? (
                <p className="text-sm text-gray-400">{t('loadingBackups')}</p>
              ) : backups.length > 0 ? (
                backups.map((backup) => (
                  <div key={backup.id} className={`flex flex-col gap-3 rounded-2xl border p-3 sm:flex-row sm:items-center sm:justify-between ${selectedBackupIds.includes(backup.id) ? 'border-[#0f9b8e] bg-[#0f9b8e]/10' : 'border-[#2a2a4a] bg-[#0d0d1a]'}`}>
                    <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
                      <input
                        type="checkbox"
                        checked={selectedBackupIds.includes(backup.id)}
                        onChange={() => toggleBackupSelection(backup.id)}
                        className="mt-1 h-4 w-4 rounded border-gray-400 bg-transparent text-[#0f9b8e] focus:ring-[#0f9b8e]"
                      />
                      <div className="min-w-0">
                        <p className="font-semibold text-white">
                          {new Date(backup.created_at).toLocaleString(language)}
                        </p>
                        <p className="text-sm text-gray-400">
                          {t('backupUsersCount', { count: backup.user_count })} • {t('backupGamesCount', { count: backup.game_count ?? ((backup.match_history?.length || 0) + (backup.game_sessions?.length || 0)) })} • {t('backupSettingsCount', { count: backup.settings_count ?? (backup.settings?.length || 0) })} • {backup.reason}
                        </p>
                      </div>
                    </label>
                    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                      <button
                        type="button"
                        onClick={() => handleDeleteBackup(backup)}
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-[#7c2235] px-4 text-sm font-semibold hover:bg-[#982946]"
                      >
                        <Trash2 className="h-4 w-4" />
                        {t('deleteBackup')}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRestoreBackup(backup)}
                        disabled={restoringBackupId === backup.id}
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-[#2a2a4a] px-4 text-sm font-semibold hover:bg-[#3a3a5a] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <RotateCcw className={`h-4 w-4 ${restoringBackupId === backup.id ? 'animate-spin' : ''}`} />
                        {restoringBackupId === backup.id ? t('restoringBackup') : t('restoreBackup')}
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-gray-400">{t('backupEmpty')}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {showSystemBackupsModal && isAdmin && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 px-3 py-4 sm:px-4 sm:py-6">
          <div className="mx-auto w-full max-w-3xl rounded-3xl border border-[#2a2a4a] bg-[#16213e] p-4 shadow-2xl sm:p-5 md:p-6">
            <div className="mb-5 flex items-start justify-between gap-3 sm:mb-6">
              <div className="min-w-0">
                <h3 className="text-2xl font-bold">{t('systemBackupsModalTitle')}</h3>
                <p className="text-sm text-gray-400">{t('systemBackupsModalDesc')}</p>
              </div>
              <button onClick={() => setShowSystemBackupsModal(false)} className="rounded-full bg-[#2a2a4a] p-2 hover:bg-[#3a3a5a]">
                <X className="h-5 w-5 text-gray-300" />
              </button>
            </div>

            <div className="mb-4 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={refreshSystemBackups}
                disabled={systemBackupsLoading}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#2a2a4a] px-4 font-semibold hover:bg-[#3a3a5a] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCw className={`h-4 w-4 ${systemBackupsLoading ? 'animate-spin' : ''}`} />
                {t('refreshSystemBackups')}
              </button>
              <button
                type="button"
                onClick={toggleAllSystemBackupsSelection}
                disabled={systemBackupsLoading || systemBackups.length === 0}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#2a2a4a] px-4 font-semibold hover:bg-[#3a3a5a] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {selectedSystemBackupIds.length === systemBackups.length && systemBackups.length > 0 ? t('unselectAll') : t('selectAll')}
              </button>
              <button
                type="button"
                onClick={handleDeleteSelectedSystemBackups}
                disabled={systemBackupsLoading || selectedSystemBackupIds.length === 0}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#7c2235] px-4 font-semibold hover:bg-[#982946] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Trash2 className="h-4 w-4" />
                {t('deleteSelectedSystemBackups')}
              </button>
            </div>

            {systemBackupsError ? <p className="mb-4 text-sm text-red-400">{systemBackupsError}</p> : null}

            <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
              {systemBackupsLoading ? (
                <p className="text-sm text-gray-400">{t('loadingSystemBackups')}</p>
              ) : systemBackups.length > 0 ? (
                systemBackups.map((backup) => {
                  const manifest = backup.manifest || {};
                  const recordCount = backup.record_count ?? manifest.record_count ?? 0;
                  const uploadCount = backup.upload_count ?? manifest.upload_count ?? 0;
                  const userBackupCount = backup.user_backup_count ?? manifest.user_backup_count ?? 0;
                  return (
                    <div key={backup.id} className={`flex flex-col gap-3 rounded-2xl border p-3 sm:flex-row sm:items-center sm:justify-between ${selectedSystemBackupIds.includes(backup.id) ? 'border-[#f5b942] bg-[#f5b942]/10' : 'border-[#2a2a4a] bg-[#0d0d1a]'}`}>
                      <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
                        <input
                          type="checkbox"
                          checked={selectedSystemBackupIds.includes(backup.id)}
                          onChange={() => toggleSystemBackupSelection(backup.id)}
                          className="mt-1 h-4 w-4 rounded border-gray-400 bg-transparent text-[#f5b942] focus:ring-[#f5b942]"
                        />
                        <div className="min-w-0">
                          <p className="font-semibold text-white">
                            {new Date(backup.created_at).toLocaleString(language)}
                          </p>
                          <p className="text-sm text-gray-400">
                            {t('systemBackupRecordsCount', { count: recordCount })} • {t('systemBackupUploadsCount', { count: uploadCount })} • {t('systemBackupUserBackupsCount', { count: userBackupCount })} • {backup.reason}
                          </p>
                        </div>
                      </label>
                      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                        <button
                          type="button"
                          onClick={() => handleDeleteSystemBackup(backup)}
                          className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-[#7c2235] px-4 text-sm font-semibold hover:bg-[#982946]"
                        >
                          <Trash2 className="h-4 w-4" />
                          {t('deleteSystemBackup')}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRestoreSystemBackup(backup)}
                          disabled={restoringSystemBackupId === backup.id}
                          className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-[#2a2a4a] px-4 text-sm font-semibold hover:bg-[#3a3a5a] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <RotateCcw className={`h-4 w-4 ${restoringSystemBackupId === backup.id ? 'animate-spin' : ''}`} />
                          {restoringSystemBackupId === backup.id ? t('restoringSystemBackup') : t('restoreSystemBackup')}
                        </button>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-sm text-gray-400">{t('systemBackupEmpty')}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {validityModalUser && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 px-3 py-4 sm:px-4 sm:py-6">
          <div className="mx-auto w-full max-w-2xl rounded-3xl border border-[#2a2a4a] bg-[#16213e] p-4 shadow-2xl sm:p-5 md:p-6">
            <div className="mb-5 flex items-start justify-between gap-3 sm:mb-6">
              <div className="min-w-0">
                <h3 className="text-2xl font-bold">{t('editValidity')}</h3>
                <p className="text-sm text-gray-400">{t('editValidityDesc')}</p>
              </div>
              <button onClick={closeValidityModal} className="rounded-full bg-[#2a2a4a] p-2 hover:bg-[#3a3a5a]">
                <X className="h-5 w-5 text-gray-300" />
              </button>
            </div>

            <div className="mb-4 rounded-2xl border border-[#2a2a4a] bg-[#0d0d1a] p-3 sm:p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-gray-500">{t('selectedUser')}</p>
              <p className="mt-1 text-sm font-semibold text-white">{validityModalUser.email}</p>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); handleUpdateValidity(); }} className="space-y-4">
              <section className="space-y-3 rounded-2xl border border-[#2a2a4a] bg-[#0d0d1a] p-3 sm:p-4">
                <SectionHeader
                  icon={CalendarDays}
                  title={t('accountValidityTitle')}
                  hint={t('accountValidityHint')}
                />
                <div className="grid gap-2 sm:grid-cols-3 sm:gap-3">
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={validityForm.validity_amount}
                    onChange={(e) => setValidityForm((p) => ({
                      ...p,
                      validity_amount: Number.parseInt(e.target.value, 10) || DEFAULT_NEW_USER_VALIDITY.amount,
                    }))}
                    disabled={validityForm.never_expires}
                    className="h-10 rounded-xl border border-[#3a3a5a] bg-[#16213e] px-3 sm:h-11"
                  />
                  <select
                    value={validityForm.validity_unit}
                    onChange={(e) => setValidityForm((p) => ({ ...p, validity_unit: e.target.value }))}
                    disabled={validityForm.never_expires}
                    className="h-10 rounded-xl border border-[#3a3a5a] bg-[#16213e] px-3 sm:h-11 sm:col-span-2"
                  >
                    <option value="days">{t('validityDays')}</option>
                    <option value="months">{t('validityMonths')}</option>
                    <option value="years">{t('validityYears')}</option>
                  </select>
                </div>
                <label className="flex items-center gap-2 text-sm text-gray-300">
                  <input
                    type="checkbox"
                    checked={validityForm.never_expires}
                    onChange={(e) => setValidityForm((p) => ({ ...p, never_expires: e.target.checked }))}
                    className="h-4 w-4 rounded border-gray-500 bg-[#0d0d1a]"
                  />
                  {t('neverExpires')}
                </label>
                <p className="text-xs text-gray-500">
                  {t('neverExpiresHint')}
                </p>
              </section>

              {validityError ? <p className="text-sm text-red-400">{validityError}</p> : null}

              <div className="flex flex-col-reverse justify-end gap-3 sm:flex-row">
                <button onClick={closeValidityModal} type="button" className="h-11 rounded-full bg-[#2a2a4a] px-5 hover:bg-[#3a3a5a]">
                  {t('cancel')}
                </button>
                <button type="submit" disabled={validitySaving} className="h-11 rounded-full bg-[#0f9b8e] px-5 hover:bg-[#0d847a] disabled:opacity-60">
                  {validitySaving ? t('saving') : t('saveTerm')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {passwordModalUser && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#16213e] border border-[#2a2a4a] rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-bold">{t('resetPasswordTitle')}</h3>
              <button onClick={() => setPasswordModalUser(null)} className="p-1 rounded-full bg-[#2a2a4a] hover:bg-[#3a3a5a]">
                <X className="w-4 h-4 text-gray-300" />
              </button>
            </div>
            <p className="text-sm text-gray-400 mb-3">{passwordModalUser.email}</p>
            <input type={showResetPassword ? 'text' : 'password'} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder={t('newPassword')} className="w-full h-11 rounded-xl bg-[#0d0d1a] border border-[#3a3a5a] px-3" />
            <input type={showResetPassword ? 'text' : 'password'} value={confirmNewPassword} onChange={(e) => setConfirmNewPassword(e.target.value)} placeholder={t('confirmNewPassword')} className="w-full h-11 rounded-xl bg-[#0d0d1a] border border-[#3a3a5a] px-3 mt-2" />
            <label className="mt-1 text-xs text-gray-400 text-right block cursor-pointer">
              <input
                type="checkbox"
                checked={showResetPassword}
                onChange={(e) => setShowResetPassword(e.target.checked)}
                className="mr-1 align-middle"
              />
              {t('showPassword')}
            </label>
            <p className="text-xs text-gray-500 mt-2">{t('passwordRules')}</p>
            {resetError ? <p className="text-red-400 text-sm mt-2">{resetError}</p> : null}
            <div className="flex gap-2 mt-4">
              <button onClick={() => setPasswordModalUser(null)} className="flex-1 h-10 rounded-full bg-[#2a2a4a] hover:bg-[#3a3a5a]">{t('cancel')}</button>
              <button onClick={handleResetPassword} disabled={resetLoading} className="flex-1 h-10 rounded-full bg-[#0f9b8e] hover:bg-[#0d847a] disabled:opacity-60">
                {resetLoading ? t('saving') : t('savePassword')}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}

