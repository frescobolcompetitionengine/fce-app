import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Ruler, Save, Trash2, Users, Zap } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Navigate, useLocation } from 'react-router-dom';
import PlayerPhotoEditor from '@/components/PlayerPhotoEditor';
import LanguageSelector from '@/components/LanguageSelector';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createPageUrl } from '@/utils';
import { setAppLanguage, useI18n } from '@/lib/i18n';
import { getTrackedPreviousPath } from '@/lib/NavigationTracker';
import { resolveScoringConfiguration } from '@/lib/scoring';
import { useAuth } from '@/lib/AuthContext';
import PageShell from '@/components/PageShell';
import {
  createSettings,
  deleteSettings,
  ensureDefaultSettingsProfile,
  listSettings,
  selectPreferredSettingsProfile,
  setActiveSettingsProfile,
  updateSettings,
  SETTINGS_PROFILE_DEFAULTS,
} from '@/services/settingsRepository';

const defaultFormData = {
  ...SETTINGS_PROFILE_DEFAULTS,
  player_left_name: '',
  player_right_name: '',
  player_left_photo: '',
  player_right_photo: '',
  player_left_radar_enabled: false,
  player_right_radar_enabled: false,
};

const GENERIC_PLAYER_NAME_PATTERN = /^(?:Player|Jogador|プレイヤー)\s*[12]$/u;
const NEW_PROFILE_ID = '__new_profile__';

const normalizeDisplayedValue = (value) => {
  const normalized = String(value ?? '').trim();
  if (!normalized) return '';
  return GENERIC_PLAYER_NAME_PATTERN.test(normalized) ? '' : normalized;
};

/** @typedef {typeof defaultFormData} SettingsFormData */

export default function Settings() {
  const { t } = useI18n();
  const { user, isSpectator, isTournament, logout } = useAuth();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [profiles, setProfiles] = useState([]);
  const [selectedProfileId, setSelectedProfileId] = useState(null);
  const [profileName, setProfileName] = useState('default');
  const [newProfileName, setNewProfileName] = useState('');
  const [formData, setFormData] = useState(defaultFormData);
  const fallbackReturnTo = isTournament ? createPageUrl('TournamentRoom') : createPageUrl('SpeedMeter');
  const returnTo = location.state?.returnTo || getTrackedPreviousPath() || fallbackReturnTo;

  const profileOptions = useMemo(() => {
    const ordered = [...profiles].sort((a, b) => {
      if (a.is_default_profile && !b.is_default_profile) return -1;
      if (!a.is_default_profile && b.is_default_profile) return 1;
      const nameA = String(a.profile_name || '').toLowerCase();
      const nameB = String(b.profile_name || '').toLowerCase();
      return nameA.localeCompare(nameB);
    });
    return ordered;
  }, [profiles]);

  const isDraftProfile = selectedProfileId === NEW_PROFILE_ID;

  const selectedProfile = useMemo(() => {
    if (isDraftProfile) return null;
    if (selectedProfileId) {
      const match = profileOptions.find((item) => item.id === selectedProfileId);
      if (match) return match;
    }
    return selectPreferredSettingsProfile(profileOptions);
  }, [isDraftProfile, profileOptions, selectedProfileId]);

  const isDefaultProfileLocked = Boolean(selectedProfile?.is_default_profile && !isDraftProfile);

  const mapProfileToForm = (settings) => ({
    ...defaultFormData,
    duo_name: settings.duo_name || '',
    visibility: settings.visibility || 'private',
    distance_meters: settings.distance_meters ?? SETTINGS_PROFILE_DEFAULTS.distance_meters,
    match_duration_minutes: settings.match_duration_minutes ?? SETTINGS_PROFILE_DEFAULTS.match_duration_minutes,
    warmup_duration_minutes: settings.warmup_duration_minutes ?? settings.match_duration_minutes ?? SETTINGS_PROFILE_DEFAULTS.warmup_duration_minutes,
    player_left_name: normalizeDisplayedValue(settings.player_left_name),
    player_right_name: normalizeDisplayedValue(settings.player_right_name),
    player_left_photo: settings.player_left_photo || '',
    player_right_photo: settings.player_right_photo || '',
    player_left_radar_enabled: settings.player_left_radar_enabled ?? false,
    player_right_radar_enabled: settings.player_right_radar_enabled ?? false,
    language: settings.language || 'pt-BR',
    scoring_mode: settings.scoring_mode || 'option_1',
    min_scoring_speed: settings.min_scoring_speed ?? SETTINGS_PROFILE_DEFAULTS.min_scoring_speed,
    free_ball_drops: settings.free_ball_drops ?? SETTINGS_PROFILE_DEFAULTS.free_ball_drops,
    max_ball_drops: settings.max_ball_drops ?? SETTINGS_PROFILE_DEFAULTS.max_ball_drops,
    count_ball_drops: settings.count_ball_drops ?? SETTINGS_PROFILE_DEFAULTS.count_ball_drops,
    balance_enabled: settings.balance_enabled ?? SETTINGS_PROFILE_DEFAULTS.balance_enabled,
    continuity_enabled: settings.continuity_enabled ?? SETTINGS_PROFILE_DEFAULTS.continuity_enabled,
    power_enabled: settings.power_enabled ?? SETTINGS_PROFILE_DEFAULTS.power_enabled,
  });

  const { data: loadedProfiles = [], isLoading } = useQuery({
    queryKey: ['settings-profiles', user?.id],
    enabled: !isSpectator,
    queryFn: async () => {
      if (!user?.id) return [];
      await ensureDefaultSettingsProfile(user.id, user.email, { activate: true });
      return listSettings('-updated_at', 500, user.id);
    },
  });

  useEffect(() => {
    setProfiles(loadedProfiles);
  }, [loadedProfiles]);

  useEffect(() => {
    if (!selectedProfile) return;
    setSelectedProfileId(selectedProfile.id);
    setProfileName(selectedProfile.profile_name || 'default');
    setNewProfileName('');
    setAppLanguage(selectedProfile.language || 'pt-BR');
    const scoringConfig = resolveScoringConfiguration(
      selectedProfile.scoring_mode || 'option_1',
      selectedProfile.min_scoring_speed ?? SETTINGS_PROFILE_DEFAULTS.min_scoring_speed,
      {
        balanceEnabled: selectedProfile.balance_enabled,
        continuityEnabled: selectedProfile.continuity_enabled,
        powerEnabled: selectedProfile.power_enabled,
      },
    );
    setFormData({
      ...mapProfileToForm(selectedProfile),
      scoring_mode: scoringConfig.scoringMode,
      min_scoring_speed: scoringConfig.minScoringSpeed,
      balance_enabled: scoringConfig.balanceEnabled,
      continuity_enabled: scoringConfig.continuityEnabled,
      power_enabled: scoringConfig.powerEnabled,
    });
  }, [selectedProfile?.id]);

  const saveMutation = useMutation({
    /** @param {SettingsFormData} data */
    mutationFn: async (data) => {
      if (!selectedProfile?.id && !isDraftProfile) {
        throw new Error('Nenhum perfil selecionado.');
      }
      if (isDefaultProfileLocked) {
        throw new Error('O perfil default é fixo. Use "Guardar como novo" para criar uma variação.');
      }
      const nextName = isDraftProfile
        ? String(newProfileName || '').trim()
        : (selectedProfile.is_default_profile ? 'default' : String(profileName || '').trim());
      if (!nextName) throw new Error('O nome do perfil é obrigatório.');
      if (!selectedProfile?.is_default_profile && nextName.toLowerCase() === 'default') {
        throw new Error('default é reservado para o perfil padrão.');
      }
      const payload = {
        ...data,
        profile_name: nextName,
        is_default_profile: Boolean(selectedProfile?.is_default_profile),
        is_active_profile: true,
        owner_user_id: user?.id,
        owner_email: user?.email,
      };
      if (isDraftProfile) {
        const created = await createSettings(payload);
        await setActiveSettingsProfile(created.id, user?.id);
        return created;
      }
      const saved = await updateSettings(selectedProfile.id, payload);
      await setActiveSettingsProfile(saved.id, user?.id);
      return saved;
    },
    onSuccess: (savedSettings) => {
      queryClient.invalidateQueries({ queryKey: ['settings-profiles', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      setAppLanguage(savedSettings.language || 'pt-BR');
      setSelectedProfileId(savedSettings.id);
      setProfileName(savedSettings.profile_name || 'default');
      setNewProfileName('');
      toast.success(t('save'));
    },
    onError: (error) => toast.error(error?.message || 'Falha ao salvar.'),
  });

  const saveAsNewMutation = useMutation({
    mutationFn: async () => {
      if (!selectedProfile && !isDraftProfile) throw new Error('Nenhum perfil selecionado.');
      const nextName = String(newProfileName || '').trim();
      if (!nextName) throw new Error('O nome do novo perfil é obrigatório.');
      if (nextName.toLowerCase() === 'default') {
        throw new Error('default é reservado para o perfil padrão.');
      }
      const payload = {
        ...formData,
        profile_name: nextName,
        is_default_profile: false,
        is_active_profile: true,
        owner_user_id: user?.id,
        owner_email: user?.email,
      };
      const created = await createSettings(payload);
      await setActiveSettingsProfile(created.id, user?.id);
      return created;
    },
    onSuccess: async (created) => {
      setSelectedProfileId(created.id);
      setProfileName(created.profile_name || 'default');
      setNewProfileName('');
      setAppLanguage(created.language || 'pt-BR');
      await queryClient.invalidateQueries({ queryKey: ['settings-profiles', user?.id] });
      await queryClient.invalidateQueries({ queryKey: ['settings'] });
      toast.success(t('save'));
    },
    onError: (error) => toast.error(error?.message || 'Falha ao salvar.'),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!selectedProfile?.id) throw new Error('Nenhum perfil selecionado.');
      if (selectedProfile.is_default_profile) throw new Error('O perfil default não pode ser apagado.');
      await deleteSettings(selectedProfile.id);
      return selectedProfile.id;
    },
    onSuccess: async () => {
      const remaining = profileOptions.filter((item) => item.id !== selectedProfileId);
      const nextProfile = selectPreferredSettingsProfile(remaining);
      if (nextProfile?.id && user?.id) {
        await setActiveSettingsProfile(nextProfile.id, user.id);
      }
      setSelectedProfileId(nextProfile?.id || null);
      setProfileName(nextProfile?.profile_name || 'default');
      setNewProfileName(nextProfile?.is_default_profile ? '' : nextProfile?.profile_name || '');
      setFormData(nextProfile ? mapProfileToForm(nextProfile) : defaultFormData);
      await queryClient.invalidateQueries({ queryKey: ['settings-profiles', user?.id] });
      await queryClient.invalidateQueries({ queryKey: ['settings'] });
      toast.success(t('delete'));
    },
    onError: (error) => toast.error(error?.message || 'Falha ao apagar.'),
  });

  const handleProfileSelect = async (profileId) => {
    if (profileId === NEW_PROFILE_ID) {
      setSelectedProfileId(NEW_PROFILE_ID);
      setProfileName('novo perfil');
      setNewProfileName('');
      return;
    }

    const nextProfile = profileOptions.find((item) => item.id === profileId);
    if (!nextProfile) return;
    setSelectedProfileId(profileId);
    setProfileName(nextProfile.profile_name || 'default');
    setNewProfileName('');
    setFormData(mapProfileToForm(nextProfile));
    setAppLanguage(nextProfile.language || 'pt-BR');
    if (user?.id) {
      await setActiveSettingsProfile(profileId, user.id);
      await queryClient.invalidateQueries({ queryKey: ['settings-profiles', user?.id] });
      await queryClient.invalidateQueries({ queryKey: ['settings'] });
    }
  };

  const handleChange = (field, value) => setFormData((prev) => (
    isDefaultProfileLocked ? prev : (
    field === 'scoring_mode'
      ? ({
          ...prev,
          scoring_mode: value,
          ...(() => {
            const config = resolveScoringConfiguration(value, prev.min_scoring_speed, {
              balanceEnabled: prev.balance_enabled,
              continuityEnabled: prev.continuity_enabled,
              powerEnabled: prev.power_enabled,
            });
            return {
              min_scoring_speed: config.minScoringSpeed,
              balance_enabled: config.balanceEnabled,
              continuity_enabled: config.continuityEnabled,
              power_enabled: config.powerEnabled,
            };
          })(),
        })
      : { ...prev, [field]: value }
    )
  ));
  const handleNumericChange = (field, value) => setFormData((prev) => (isDefaultProfileLocked ? prev : ({ ...prev, [field]: parseFloat(value) || 0 })));

  if (isLoading) {
    return <div className="min-h-[100dvh] bg-gradient-to-b from-[#1a1a2e] to-[#0d0d1a] flex items-center justify-center"><div className="animate-spin w-8 h-8 border-4 border-[#e94560] border-t-transparent rounded-full" /></div>;
  }

  if (isSpectator) {
    return <Navigate to={createPageUrl('SpectatorHub')} replace />;
  }

  return (
    <PageShell
      title={t('settings')}
      backTo={returnTo}
      headerRight={(
        <Button onClick={() => saveMutation.mutate(formData)} disabled={saveMutation.isPending || isDefaultProfileLocked} className="bg-[#e94560] hover:bg-[#c73e54] rounded-full px-5 h-10 text-sm md:h-12 md:text-base font-semibold disabled:opacity-50">
          <Save className="w-5 h-5 mr-2" />
          {isDefaultProfileLocked ? 'Perfil fixo' : t('save')}
        </Button>
      )}
      contentClassName="pt-4"
    >
      <div className="space-y-8 max-w-lg mx-auto">
        <LanguageSelector
          value={formData.language}
          disabled={isDefaultProfileLocked}
          onChange={(value) => {
            handleChange('language', value);
            setAppLanguage(value);
          }}
        />

        <div className="bg-[#16213e] rounded-2xl p-6 border border-[#2a2a4a]">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 rounded-xl bg-[#0f9b8e]/20"><Users className="w-6 h-6 text-[#0f9b8e]" /></div>
            <h2 className="text-xl font-bold">{t('players')}</h2>
          </div>
          <div className="grid grid-cols-2 gap-6">
            <div className="flex flex-col items-center gap-3">
              <PlayerPhotoEditor
                photoUrl={formData.player_left_photo}
                onPhotoChange={(url) => handleChange('player_left_photo', url)}
                label={t('leftPlayer')}
                disabled={isDefaultProfileLocked}
              />
              <div className="w-full space-y-1">
                <div className="flex items-center justify-between gap-3">
                  <Label className="text-gray-400 text-sm">{t('name')}</Label>
                  <label className="flex items-center gap-2 text-xs text-gray-400 select-none">
                    <input
                      type="checkbox"
                      checked={formData.player_left_radar_enabled}
                      disabled={isDefaultProfileLocked}
                      onChange={(e) => handleChange('player_left_radar_enabled', e.target.checked)}
                      className="h-4 w-4 rounded border-[#3a3a5a] bg-[#0d0d1a] text-[#0f9b8e] focus:ring-[#0f9b8e] disabled:cursor-not-allowed disabled:opacity-60"
                    />
                    <span>{t('radar')}</span>
                  </label>
                </div>
                <Input value={formData.player_left_name} onChange={(e) => handleChange('player_left_name', e.target.value)} disabled={isDefaultProfileLocked} placeholder={t('leftPlayer')} className="bg-[#0d0d1a] border-[#3a3a5a] text-white text-base h-11 font-semibold text-center placeholder:text-gray-400 disabled:cursor-not-allowed disabled:opacity-60" />
              </div>
            </div>
            <div className="flex flex-col items-center gap-3">
              <PlayerPhotoEditor
                photoUrl={formData.player_right_photo}
                onPhotoChange={(url) => handleChange('player_right_photo', url)}
                label={t('rightPlayer')}
                disabled={isDefaultProfileLocked}
              />
              <div className="w-full space-y-1">
                <div className="flex items-center justify-between gap-3">
                  <Label className="text-gray-400 text-sm">{t('name')}</Label>
                  <label className="flex items-center gap-2 text-xs text-gray-400 select-none">
                    <input
                      type="checkbox"
                      checked={formData.player_right_radar_enabled}
                      disabled={isDefaultProfileLocked}
                      onChange={(e) => handleChange('player_right_radar_enabled', e.target.checked)}
                      className="h-4 w-4 rounded border-[#3a3a5a] bg-[#0d0d1a] text-[#0f9b8e] focus:ring-[#0f9b8e] disabled:cursor-not-allowed disabled:opacity-60"
                    />
                    <span>{t('radar')}</span>
                  </label>
                </div>
                <Input value={formData.player_right_name} onChange={(e) => handleChange('player_right_name', e.target.value)} disabled={isDefaultProfileLocked} placeholder={t('rightPlayer')} className="bg-[#0d0d1a] border-[#3a3a5a] text-white text-base h-11 font-semibold text-center placeholder:text-gray-400 disabled:cursor-not-allowed disabled:opacity-60" />
              </div>
            </div>
          </div>
        </div>

        <div className="bg-[#16213e] rounded-2xl p-6 border border-[#2a2a4a]">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 rounded-xl bg-[#0f9b8e]/20"><Ruler className="w-6 h-6 text-[#0f9b8e]" /></div>
            <h2 className="text-xl font-bold">{t('distanceDuration')}</h2>
          </div>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-gray-400 text-base">{t('distanceMeters')}</Label>
              <Input type="number" value={formData.distance_meters} onChange={(e) => handleNumericChange('distance_meters', e.target.value)} disabled={isDefaultProfileLocked} className="bg-[#0d0d1a] border-[#3a3a5a] text-white text-2xl h-16 font-semibold disabled:cursor-not-allowed disabled:opacity-60" min="1" step="0.1" />
            </div>
            <div className="space-y-2">
              <Label className="text-gray-400 text-base">{t('matchDurationMinutes')}</Label>
              <Input type="number" value={formData.match_duration_minutes} onChange={(e) => handleNumericChange('match_duration_minutes', e.target.value)} disabled={isDefaultProfileLocked} className="bg-[#0d0d1a] border-[#3a3a5a] text-white text-2xl h-16 font-semibold disabled:cursor-not-allowed disabled:opacity-60" min="1" step="1" />
            </div>
            <div className="space-y-2">
              <Label className="text-gray-400 text-base">{t('warmupDurationMinutes')}</Label>
              <Input type="number" value={formData.warmup_duration_minutes} onChange={(e) => handleNumericChange('warmup_duration_minutes', e.target.value)} disabled={isDefaultProfileLocked} className="bg-[#0d0d1a] border-[#3a3a5a] text-white text-2xl h-16 font-semibold disabled:cursor-not-allowed disabled:opacity-60" min="0" step="1" />
            </div>
          </div>
        </div>

        <div className="bg-[#16213e] rounded-2xl p-6 border border-[#2a2a4a]">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 rounded-xl bg-[#e94560]/20"><Zap className="w-6 h-6 text-[#e94560]" /></div>
            <h2 className="text-xl font-bold">{t('speedRules')}</h2>
          </div>
          <p className="text-base text-gray-400 mb-4">{t('speedRulesDesc')}</p>

          <div className={`rounded-xl p-4 border mb-4 transition-colors ${isDraftProfile ? 'bg-[#1a140d] border-amber-500/40 shadow-[0_0_0_1px_rgba(245,158,11,0.12)]' : 'bg-[#0d0d1a] border-[#2a2a4a]'}`}>
            <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
              <div>
                <Label className="text-gray-300 text-base font-semibold block mb-1">Perfis de regras</Label>
                <p className="text-gray-500 text-sm">Guarda combinações completas de tempo, distância e pontuação.</p>
              </div>
              {selectedProfile?.is_default_profile && (
                <span className="inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-200">
                  default
                </span>
              )}
              {isDraftProfile && (
                <span className="inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-200">
                  novo perfil
                </span>
              )}
            </div>

            <div className="grid gap-3 md:grid-cols-[1.2fr_1fr]">
              <div className="space-y-2">
                <Label className="text-gray-400 text-sm">Perfil ativo</Label>
                <select
                  value={selectedProfileId || ''}
                  onChange={(e) => handleProfileSelect(e.target.value)}
                  className={`h-11 w-full rounded-xl border px-3 text-white outline-none transition-colors ${isDraftProfile ? 'border-amber-400/60 bg-[#2a1b0d]' : 'border-[#3a3a5a] bg-[#1a1a2e]'}`}
                >
                  <option value={NEW_PROFILE_ID}>Novo perfil</option>
                  {profileOptions.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.profile_name || 'Perfil sem nome'}
                      {profile.is_default_profile ? ' (default)' : ''}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500">
                  {isDraftProfile
                    ? 'Modo criação: as alterações serão guardadas como um perfil novo.'
                    : 'Modo edição: as alterações vão atualizar o perfil selecionado.'}
                </p>
                {isDefaultProfileLocked && (
                  <p className="text-xs text-amber-300/90">
                    O perfil padrão é fixo. Use <span className="font-semibold">Guardar como novo</span> para criar uma variante.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label className="text-gray-400 text-sm">
                  {isDraftProfile ? 'Nome do novo perfil' : 'Nome do perfil'}
                </Label>
                <Input
                  value={isDraftProfile ? newProfileName : profileName}
                  onChange={(e) => (isDraftProfile ? setNewProfileName(e.target.value) : setProfileName(e.target.value))}
                  placeholder={isDraftProfile ? 'Ex.: Torneio, Treino, Finais' : 'Ex.: Torneio, Treino, Finais'}
                  disabled={selectedProfile?.is_default_profile && !isDraftProfile}
                  className={`text-white text-base h-11 font-semibold placeholder:text-gray-400 transition-colors ${isDraftProfile ? 'bg-[#2a1b0d] border-amber-400/60 focus:border-amber-300' : 'bg-[#1a1a2e] border-[#3a3a5a]'}`}
                />
                {!isDraftProfile && selectedProfile?.is_default_profile && (
                  <p className="text-xs text-amber-300/90">
                    O nome do perfil padrão é fixo em <span className="font-semibold">default</span>.
                  </p>
                )}
              </div>
            </div>

            <div className={`mt-4 flex flex-wrap gap-2 rounded-2xl p-2 transition-colors ${isDraftProfile ? 'border border-amber-500/20 bg-amber-500/5' : 'border border-white/0 bg-transparent'}`}>
              <Button
                type="button"
                onClick={() => saveMutation.mutate(formData)}
                disabled={saveMutation.isPending || isDefaultProfileLocked}
                className={`min-w-[152px] flex-1 rounded-full px-4 h-10 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60 ${isDefaultProfileLocked ? 'bg-amber-500 text-[#0d0d1a]' : (isDraftProfile ? 'bg-amber-500 hover:bg-amber-400 text-[#0d0d1a]' : 'bg-[#0f9b8e] hover:bg-[#0d847a] text-white')}`}
              >
                <Save className="w-4 h-4 mr-2" />
                {isDefaultProfileLocked ? 'Perfil fixo' : (isDraftProfile ? 'Criar perfil' : 'Guardar perfil')}
              </Button>
              <Button
                type="button"
                onClick={() => saveAsNewMutation.mutate()}
                disabled={saveAsNewMutation.isPending}
                className="min-w-[152px] flex-1 bg-[#2a2a4a] hover:bg-[#3a3a5a] rounded-full px-4 h-10 text-sm font-semibold"
              >
                <Plus className="w-4 h-4 mr-2" />
                Guardar como novo
              </Button>
              <Button
                type="button"
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending || selectedProfile?.is_default_profile}
                className="min-w-[152px] flex-1 bg-red-800/70 hover:bg-red-700 rounded-full px-4 h-10 text-sm font-semibold disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Apagar perfil
              </Button>
            </div>
          </div>

          <div className="bg-[#0d0d1a] rounded-xl p-4 border border-[#2a2a4a] mb-4">
            <Label className="text-gray-300 text-base font-semibold block mb-3">{t('scoringFormula')}</Label>
            <div className="space-y-3">
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="radio" name="scoring_mode" value="option_1" checked={formData.scoring_mode === 'option_1'} onChange={() => handleChange('scoring_mode', 'option_1')} disabled={isDefaultProfileLocked} className="mt-1 disabled:cursor-not-allowed disabled:opacity-60" />
                <div><p className="text-white font-semibold">{t('option1')}</p><p className="text-gray-400 text-sm">{t('scoringFormulaOption1Desc')}</p></div>
              </label>
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="radio" name="scoring_mode" value="option_2" checked={formData.scoring_mode === 'option_2'} onChange={() => handleChange('scoring_mode', 'option_2')} disabled={isDefaultProfileLocked} className="mt-1 disabled:cursor-not-allowed disabled:opacity-60" />
                <div><p className="text-white font-semibold">{t('option2')}</p><p className="text-gray-400 text-sm">{t('scoringFormulaOption2Desc')}</p></div>
              </label>
            </div>
          </div>

          <div className="bg-[#0d0d1a] rounded-xl p-4 border border-[#2a2a4a] mb-4">
            <Label className="text-gray-300 text-base font-semibold block mb-2">{t('minSpeedScore')}</Label>
            <Input type="number" value={formData.min_scoring_speed} onChange={(e) => handleNumericChange('min_scoring_speed', e.target.value)} disabled={isDefaultProfileLocked} className="bg-[#1a1a2e] border-[#3a3a5a] text-white text-2xl h-16 font-semibold disabled:cursor-not-allowed disabled:opacity-60" min="0" step="1" />
          </div>

          <div className="bg-[#0d0d1a] rounded-xl p-4 border border-[#2a2a4a] mb-4">
            <Label className="text-gray-300 text-base font-semibold block mb-2">{t('freeDrops')}</Label>
            <p className="text-gray-500 text-sm mb-3">{t('freeDropsDesc')}</p>
            <Input type="number" value={formData.free_ball_drops} onChange={(e) => handleNumericChange('free_ball_drops', e.target.value)} disabled={isDefaultProfileLocked} className="bg-[#1a1a2e] border-[#3a3a5a] text-white text-2xl h-16 font-semibold disabled:cursor-not-allowed disabled:opacity-60" min="0" step="1" />
          </div>

          <div className="bg-[#0d0d1a] rounded-xl p-4 border border-[#2a2a4a] mb-6">
            <Label className="text-gray-300 text-base font-semibold block mb-3">{t('dropsToEnd')}</Label>
            <div className="flex items-center gap-3 mb-3">
              <button type="button" disabled={isDefaultProfileLocked} onClick={() => handleChange('count_ball_drops', !formData.count_ball_drops)} className={`relative flex-shrink-0 w-12 h-6 rounded-full transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-60 ${formData.count_ball_drops ? 'bg-[#0f9b8e]' : 'bg-gray-700'}`}>
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${formData.count_ball_drops ? 'translate-x-6' : 'translate-x-0'}`} />
              </button>
              <span className="text-gray-400 text-sm">{formData.count_ball_drops ? t('enabledEndByDrops') : t('disabledEndByDrops')}</span>
            </div>
            {formData.count_ball_drops && <Input type="number" value={formData.max_ball_drops} onChange={(e) => handleNumericChange('max_ball_drops', e.target.value)} disabled={isDefaultProfileLocked} className="bg-[#1a1a2e] border-[#3a3a5a] text-white text-2xl h-16 font-semibold disabled:cursor-not-allowed disabled:opacity-60" min="1" step="1" />}
          </div>

          <div className="bg-[#0d0d1a] rounded-xl p-4 border border-[#2a2a4a] mb-2">
            <Label className="text-gray-300 text-base font-semibold block mb-3">{t('balanceRule')}</Label>
            <div className="flex items-center gap-3">
              <button type="button" disabled={isDefaultProfileLocked} onClick={() => handleChange('balance_enabled', !formData.balance_enabled)} className={`relative flex-shrink-0 w-12 h-6 rounded-full transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-60 ${formData.balance_enabled ? 'bg-[#0f9b8e]' : 'bg-gray-700'}`}>
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${formData.balance_enabled ? 'translate-x-6' : 'translate-x-0'}`} />
              </button>
              <span className="text-gray-400 text-sm">{formData.balance_enabled ? t('balanceOn') : t('balanceOff')}</span>
            </div>
          </div>

          <div className="bg-[#0d0d1a] rounded-xl p-4 border border-[#2a2a4a] mb-2">
            <Label className="text-gray-300 text-base font-semibold block mb-3">{t('continuityRule')}</Label>
            <div className="flex items-center gap-3">
              <button type="button" disabled={isDefaultProfileLocked} onClick={() => handleChange('continuity_enabled', !formData.continuity_enabled)} className={`relative flex-shrink-0 w-12 h-6 rounded-full transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-60 ${formData.continuity_enabled ? 'bg-[#0f9b8e]' : 'bg-gray-700'}`}>
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${formData.continuity_enabled ? 'translate-x-6' : 'translate-x-0'}`} />
              </button>
              <span className="text-gray-400 text-sm">{formData.continuity_enabled ? t('continuityOn') : t('continuityOff')}</span>
            </div>
          </div>

          <div className="bg-[#0d0d1a] rounded-xl p-4 border border-[#2a2a4a] mb-2">
            <Label className="text-gray-300 text-base font-semibold block mb-3">{t('powerRule')}</Label>
            <div className="flex items-center gap-3">
              <button type="button" disabled={isDefaultProfileLocked} onClick={() => handleChange('power_enabled', !formData.power_enabled)} className={`relative flex-shrink-0 w-12 h-6 rounded-full transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-60 ${formData.power_enabled ? 'bg-[#0f9b8e]' : 'bg-gray-700'}`}>
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${formData.power_enabled ? 'translate-x-6' : 'translate-x-0'}`} />
              </button>
              <span className="text-gray-400 text-sm">{formData.power_enabled ? t('powerOn') : t('powerOff')}</span>
            </div>
          </div>
        </div>

        <div className="bg-[#0d0d1a] rounded-2xl p-4 border border-[#2a2a4a]">
          <p className="text-sm text-gray-500 text-center">{t('scoringInfo')}</p>
        </div>

        <button
          type="button"
          onClick={logout}
          className="w-full bg-red-800/70 hover:bg-red-700 text-white font-bold py-3 rounded-full transition-colors"
        >
          {t('logout')}
        </button>
      </div>
    </PageShell>
  );
}

