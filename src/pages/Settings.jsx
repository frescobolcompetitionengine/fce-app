import React, { useEffect, useState } from 'react';
import { Ruler, Save, Users, Zap } from 'lucide-react';
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
import { getScoringModeDefaults } from '@/lib/scoring';
import { useAuth } from '@/lib/AuthContext';
import PageShell from '@/components/PageShell';
import { createSettings, listSettings, updateSettings } from '@/services/settingsRepository';

const defaultFormData = {
  distance_meters: 10,
  match_duration_minutes: 5,
  warmup_duration_minutes: 5,
  player_left_name: '',
  player_right_name: '',
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

const GENERIC_PLAYER_NAME_PATTERN = /^(?:Player|Jogador|プレイヤー)\s*[12]$/u;

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
  const [formData, setFormData] = useState(defaultFormData);
  const returnTo = location.state?.returnTo || (isTournament ? createPageUrl('TournamentRoom') : createPageUrl('SpeedMeter'));

  const getLatestSettings = async () => {
    const all = await listSettings('-updated_at', 500);
    const mine = all.filter((s) => s.owner_user_id === user?.id);
    if (mine.length > 0) return mine[0];
    return null;
  };

  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    enabled: !isSpectator,
    queryFn: async () => {
      const latest = await getLatestSettings();
      if (latest) return latest;
      return createSettings({ ...defaultFormData, owner_user_id: user?.id, owner_email: user?.email });
    },
  });

  useEffect(() => {
    if (!settings) return;
    setAppLanguage(settings.language || 'pt-BR');
    const scoringMode = settings.scoring_mode || 'option_1';
    const scoringModeDefaults = getScoringModeDefaults(scoringMode);
    setFormData({
      distance_meters: settings.distance_meters ?? 10,
      match_duration_minutes: settings.match_duration_minutes ?? 5,
      warmup_duration_minutes: settings.warmup_duration_minutes ?? settings.match_duration_minutes ?? 5,
      player_left_name: normalizeDisplayedValue(settings.player_left_name),
      player_right_name: normalizeDisplayedValue(settings.player_right_name),
      player_left_photo: settings.player_left_photo || '',
      player_right_photo: settings.player_right_photo || '',
      player_left_radar_enabled: settings.player_left_radar_enabled ?? false,
      player_right_radar_enabled: settings.player_right_radar_enabled ?? false,
      language: settings.language || 'pt-BR',
      scoring_mode: scoringMode,
      min_scoring_speed: settings.min_scoring_speed ?? 50,
      free_ball_drops: settings.free_ball_drops ?? 5,
      max_ball_drops: settings.max_ball_drops ?? 20,
      count_ball_drops: settings.count_ball_drops ?? true,
      ...scoringModeDefaults,
      balance_enabled: settings.balance_enabled ?? scoringModeDefaults.balance_enabled,
      continuity_enabled: settings.continuity_enabled ?? scoringModeDefaults.continuity_enabled,
      power_enabled: settings.power_enabled ?? scoringModeDefaults.power_enabled,
    });
  }, [settings]);

  const saveMutation = useMutation({
    /** @param {SettingsFormData} data */
    mutationFn: async (data) => {
      const payload = { ...data, owner_user_id: user?.id, owner_email: user?.email };
      return settings?.id ? updateSettings(settings.id, payload) : createSettings(payload);
    },
    onSuccess: (savedSettings) => {
      queryClient.setQueryData(['settings'], savedSettings);
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      setAppLanguage(savedSettings.language || 'pt-BR');
      toast.success(t('save'));
    },
    onError: (error) => toast.error(error?.message || 'Falha ao salvar.'),
  });

  const handleChange = (field, value) => setFormData((prev) => (
    field === 'scoring_mode'
      ? { ...prev, scoring_mode: value, ...getScoringModeDefaults(value) }
      : { ...prev, [field]: value }
  ));
  const handleNumericChange = (field, value) => setFormData((prev) => ({ ...prev, [field]: parseFloat(value) || 0 }));

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
        <Button onClick={() => saveMutation.mutate(formData)} disabled={saveMutation.isPending} className="bg-[#e94560] hover:bg-[#c73e54] rounded-full px-5 h-10 text-sm md:h-12 md:text-base font-semibold">
          <Save className="w-5 h-5 mr-2" />
          {t('save')}
        </Button>
      )}
      contentClassName="pt-4"
    >
      <div className="space-y-8 max-w-lg mx-auto">
        <LanguageSelector
          value={formData.language}
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
              <PlayerPhotoEditor photoUrl={formData.player_left_photo} onPhotoChange={(url) => handleChange('player_left_photo', url)} label={t('leftPlayer')} />
              <div className="w-full space-y-1">
                <div className="flex items-center justify-between gap-3">
                  <Label className="text-gray-400 text-sm">{t('name')}</Label>
                  <label className="flex items-center gap-2 text-xs text-gray-400 select-none">
                    <input
                      type="checkbox"
                      checked={formData.player_left_radar_enabled}
                      onChange={(e) => handleChange('player_left_radar_enabled', e.target.checked)}
                      className="h-4 w-4 rounded border-[#3a3a5a] bg-[#0d0d1a] text-[#0f9b8e] focus:ring-[#0f9b8e]"
                    />
                    <span>{t('radar')}</span>
                  </label>
                </div>
                <Input value={formData.player_left_name} onChange={(e) => handleChange('player_left_name', e.target.value)} placeholder={t('leftPlayer')} className="bg-[#0d0d1a] border-[#3a3a5a] text-white text-base h-11 font-semibold text-center placeholder:text-gray-400" />
              </div>
            </div>
            <div className="flex flex-col items-center gap-3">
              <PlayerPhotoEditor photoUrl={formData.player_right_photo} onPhotoChange={(url) => handleChange('player_right_photo', url)} label={t('rightPlayer')} />
              <div className="w-full space-y-1">
                <div className="flex items-center justify-between gap-3">
                  <Label className="text-gray-400 text-sm">{t('name')}</Label>
                  <label className="flex items-center gap-2 text-xs text-gray-400 select-none">
                    <input
                      type="checkbox"
                      checked={formData.player_right_radar_enabled}
                      onChange={(e) => handleChange('player_right_radar_enabled', e.target.checked)}
                      className="h-4 w-4 rounded border-[#3a3a5a] bg-[#0d0d1a] text-[#0f9b8e] focus:ring-[#0f9b8e]"
                    />
                    <span>{t('radar')}</span>
                  </label>
                </div>
                <Input value={formData.player_right_name} onChange={(e) => handleChange('player_right_name', e.target.value)} placeholder={t('rightPlayer')} className="bg-[#0d0d1a] border-[#3a3a5a] text-white text-base h-11 font-semibold text-center placeholder:text-gray-400" />
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
              <Input type="number" value={formData.distance_meters} onChange={(e) => handleNumericChange('distance_meters', e.target.value)} className="bg-[#0d0d1a] border-[#3a3a5a] text-white text-2xl h-16 font-semibold" min="1" step="0.1" />
            </div>
            <div className="space-y-2">
              <Label className="text-gray-400 text-base">{t('matchDurationMinutes')}</Label>
              <Input type="number" value={formData.match_duration_minutes} onChange={(e) => handleNumericChange('match_duration_minutes', e.target.value)} className="bg-[#0d0d1a] border-[#3a3a5a] text-white text-2xl h-16 font-semibold" min="1" step="1" />
            </div>
            <div className="space-y-2">
              <Label className="text-gray-400 text-base">{t('warmupDurationMinutes')}</Label>
              <Input type="number" value={formData.warmup_duration_minutes} onChange={(e) => handleNumericChange('warmup_duration_minutes', e.target.value)} className="bg-[#0d0d1a] border-[#3a3a5a] text-white text-2xl h-16 font-semibold" min="0" step="1" />
            </div>
          </div>
        </div>

        <div className="bg-[#16213e] rounded-2xl p-6 border border-[#2a2a4a]">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 rounded-xl bg-[#e94560]/20"><Zap className="w-6 h-6 text-[#e94560]" /></div>
            <h2 className="text-xl font-bold">{t('speedRules')}</h2>
          </div>
          <p className="text-base text-gray-400 mb-4">{t('speedRulesDesc')}</p>

          <div className="bg-[#0d0d1a] rounded-xl p-4 border border-[#2a2a4a] mb-4">
            <Label className="text-gray-300 text-base font-semibold block mb-3">{t('scoringFormula')}</Label>
            <div className="space-y-3">
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="radio" name="scoring_mode" value="option_1" checked={formData.scoring_mode === 'option_1'} onChange={() => handleChange('scoring_mode', 'option_1')} className="mt-1" />
                <div><p className="text-white font-semibold">{t('option1')}</p><p className="text-gray-400 text-sm">{t('scoringFormulaOption1Desc')}</p></div>
              </label>
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="radio" name="scoring_mode" value="option_2" checked={formData.scoring_mode === 'option_2'} onChange={() => handleChange('scoring_mode', 'option_2')} className="mt-1" />
                <div><p className="text-white font-semibold">{t('option2')}</p><p className="text-gray-400 text-sm">{t('scoringFormulaOption2Desc')}</p></div>
              </label>
            </div>
          </div>

          <div className="bg-[#0d0d1a] rounded-xl p-4 border border-[#2a2a4a] mb-4">
            <Label className="text-gray-300 text-base font-semibold block mb-2">{t('minSpeedScore')}</Label>
            <Input type="number" value={formData.min_scoring_speed} onChange={(e) => handleNumericChange('min_scoring_speed', e.target.value)} className="bg-[#1a1a2e] border-[#3a3a5a] text-white text-2xl h-16 font-semibold" min="0" step="1" />
          </div>

          <div className="bg-[#0d0d1a] rounded-xl p-4 border border-[#2a2a4a] mb-4">
            <Label className="text-gray-300 text-base font-semibold block mb-2">{t('freeDrops')}</Label>
            <p className="text-gray-500 text-sm mb-3">{t('freeDropsDesc')}</p>
            <Input type="number" value={formData.free_ball_drops} onChange={(e) => handleNumericChange('free_ball_drops', e.target.value)} className="bg-[#1a1a2e] border-[#3a3a5a] text-white text-2xl h-16 font-semibold" min="0" step="1" />
          </div>

          <div className="bg-[#0d0d1a] rounded-xl p-4 border border-[#2a2a4a] mb-6">
            <Label className="text-gray-300 text-base font-semibold block mb-3">{t('dropsToEnd')}</Label>
            <div className="flex items-center gap-3 mb-3">
              <button type="button" onClick={() => handleChange('count_ball_drops', !formData.count_ball_drops)} className={`relative flex-shrink-0 w-12 h-6 rounded-full transition-colors duration-200 ${formData.count_ball_drops ? 'bg-[#0f9b8e]' : 'bg-gray-700'}`}>
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${formData.count_ball_drops ? 'translate-x-6' : 'translate-x-0'}`} />
              </button>
              <span className="text-gray-400 text-sm">{formData.count_ball_drops ? t('enabledEndByDrops') : t('disabledEndByDrops')}</span>
            </div>
            {formData.count_ball_drops && <Input type="number" value={formData.max_ball_drops} onChange={(e) => handleNumericChange('max_ball_drops', e.target.value)} className="bg-[#1a1a2e] border-[#3a3a5a] text-white text-2xl h-16 font-semibold" min="1" step="1" />}
          </div>

          <div className="bg-[#0d0d1a] rounded-xl p-4 border border-[#2a2a4a] mb-2">
            <Label className="text-gray-300 text-base font-semibold block mb-3">{t('balanceRule')}</Label>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => handleChange('balance_enabled', !formData.balance_enabled)} className={`relative flex-shrink-0 w-12 h-6 rounded-full transition-colors duration-200 ${formData.balance_enabled ? 'bg-[#0f9b8e]' : 'bg-gray-700'}`}>
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${formData.balance_enabled ? 'translate-x-6' : 'translate-x-0'}`} />
              </button>
              <span className="text-gray-400 text-sm">{formData.balance_enabled ? t('balanceOn') : t('balanceOff')}</span>
            </div>
          </div>

          <div className="bg-[#0d0d1a] rounded-xl p-4 border border-[#2a2a4a] mb-2">
            <Label className="text-gray-300 text-base font-semibold block mb-3">{t('continuityRule')}</Label>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => handleChange('continuity_enabled', !formData.continuity_enabled)} className={`relative flex-shrink-0 w-12 h-6 rounded-full transition-colors duration-200 ${formData.continuity_enabled ? 'bg-[#0f9b8e]' : 'bg-gray-700'}`}>
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${formData.continuity_enabled ? 'translate-x-6' : 'translate-x-0'}`} />
              </button>
              <span className="text-gray-400 text-sm">{formData.continuity_enabled ? t('continuityOn') : t('continuityOff')}</span>
            </div>
          </div>

          <div className="bg-[#0d0d1a] rounded-xl p-4 border border-[#2a2a4a] mb-2">
            <Label className="text-gray-300 text-base font-semibold block mb-3">{t('powerRule')}</Label>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => handleChange('power_enabled', !formData.power_enabled)} className={`relative flex-shrink-0 w-12 h-6 rounded-full transition-colors duration-200 ${formData.power_enabled ? 'bg-[#0f9b8e]' : 'bg-gray-700'}`}>
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

