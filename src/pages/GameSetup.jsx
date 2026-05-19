import React, { useEffect, useState } from 'react';
import { Play, Ruler, Users, Zap } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, Navigate } from 'react-router-dom';
import { toast } from 'sonner';
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
import { getLatestGameSession } from '@/services/gameSessionRepository';

const defaultFormData = {
  duo_name: '',
  visibility: 'private',
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

const GENERIC_TEAM_NAME_PATTERN = /^[A-Z]{3}\s[A-Z]\s&\s[A-Z]{3}\s[A-Z]$/;
const GENERIC_PLAYER_NAME_PATTERN = /^(?:Player|Jogador|プレイヤー)\s*[12]$/u;

const normalizeDisplayedValue = (value, pattern) => {
  const normalized = String(value ?? '').trim();
  if (!normalized) return '';
  return pattern.test(normalized) ? '' : normalized;
};

export default function GameSetup() {
  const { t } = useI18n();
  const { user, isSpectator } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [formData, setFormData] = useState(defaultFormData);
  const [starting, setStarting] = useState(false);
  const [checkingActiveSession, setCheckingActiveSession] = useState(true);
  const [activeSession, setActiveSession] = useState(null);

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
      duo_name: normalizeDisplayedValue(settings.duo_name, GENERIC_TEAM_NAME_PATTERN),
      visibility: settings.visibility || 'private',
      distance_meters: settings.distance_meters ?? 10,
      match_duration_minutes: settings.match_duration_minutes ?? 5,
      warmup_duration_minutes: settings.warmup_duration_minutes ?? settings.match_duration_minutes ?? 5,
      player_left_name: normalizeDisplayedValue(settings.player_left_name, GENERIC_PLAYER_NAME_PATTERN),
      player_right_name: normalizeDisplayedValue(settings.player_right_name, GENERIC_PLAYER_NAME_PATTERN),
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

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (isSpectator || !user?.id) {
        if (!cancelled) setCheckingActiveSession(false);
        return;
      }

      const activeSession = await getLatestGameSession(user.id);
      if (cancelled) return;

      if (activeSession && !activeSession.match_ended && (activeSession.is_warming_up || activeSession.game_started || activeSession.is_running || activeSession.game_status === 'warmup' || (activeSession.game_status === 'paused' && !activeSession.warmup_completed && (activeSession.warmup_started_at_ms || Number(activeSession.warmup_accumulated_ms || 0) > 0)))) {
        setActiveSession(activeSession);
      } else {
        setActiveSession(null);
      }

      setCheckingActiveSession(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [isSpectator, navigate, user?.id]);

  const handleStartGame = async () => {
    setStarting(true);
    try {
      const payload = { ...formData, owner_user_id: user?.id, owner_email: user?.email };
      const savedSettings = settings?.id ? await updateSettings(settings.id, payload) : await createSettings(payload);
      queryClient.setQueryData(['settings'], savedSettings);
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      setAppLanguage(savedSettings.language || 'pt-BR');
        setActiveSession(null);
        navigate(createPageUrl('SpeedMeter'));
      } catch (error) {
        toast.error(error?.message || t('startGameFailed'));
    } finally {
      setStarting(false);
    }
  };

  const handleChange = (field, value) => setFormData((prev) => (
    field === 'scoring_mode'
      ? { ...prev, scoring_mode: value, ...getScoringModeDefaults(value) }
      : { ...prev, [field]: value }
  ));
  const handleNumericChange = (field, value) => setFormData((prev) => ({ ...prev, [field]: parseFloat(value) || 0 }));
  const handleContinueGame = () => navigate(createPageUrl('SpeedMeter'));

  if (isSpectator) {
    return <Navigate to={createPageUrl('SpectatorHub')} replace />;
  }

  if (isLoading || checkingActiveSession) {
    return <div className="min-h-[100dvh] bg-gradient-to-b from-[#1a1a2e] to-[#0d0d1a] flex items-center justify-center"><div className="animate-spin w-8 h-8 border-4 border-[#0f9b8e] border-t-transparent rounded-full" /></div>;
  }

  return (
    <PageShell
      title={t('gameSetupTitle')}
      backTo={null}
      headerRight={(
        <Button onClick={handleStartGame} disabled={starting} className="bg-[#0f9b8e] hover:bg-[#0d847a] rounded-full px-5 h-10 text-sm md:h-12 md:text-base font-semibold">
          <Play className="w-5 h-5 mr-2" />
          {starting ? t('saving') : t('startGame')}
        </Button>
      )}
      contentClassName="pt-4"
    >
      <div className="space-y-8 max-w-lg mx-auto">
        {activeSession && (
          <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/20">
                <Play className="h-5 w-5 text-amber-300" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-amber-200">{t('matchInProgressTitle')}</p>
                <p className="mt-1 text-sm text-amber-100/80">
                  {t('matchInProgressDesc')}
                  {activeSession.duo_name ? ` ${activeSession.duo_name}.` : ''}
                </p>
              </div>
              <Button onClick={handleContinueGame} className="bg-amber-500 hover:bg-amber-400 text-[#0d0d1a] rounded-full px-4 h-10 text-sm font-semibold">
                {t('continueGame')}
              </Button>
            </div>
          </div>
        )}

        <div className="bg-[#16213e] rounded-2xl p-6 border border-[#2a2a4a]">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 rounded-xl bg-[#0f9b8e]/20"><Play className="w-6 h-6 text-[#0f9b8e]" /></div>
            <div>
              <h2 className="text-xl font-bold">{t('gameSetupTitle')}</h2>
            </div>
          </div>
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label className="text-gray-400 text-base">{t('duoName')}</Label>
              <Input
                value={formData.duo_name}
                onChange={(e) => handleChange('duo_name', e.target.value)}
                className="bg-[#0d0d1a] border-[#3a3a5a] text-white text-base h-11 font-semibold placeholder:text-gray-400"
                placeholder={t('teamNamePlaceholder')}
              />
            </div>
            <div className="space-y-3">
              <Label className="text-gray-400 text-base">{t('visibility')}</Label>
              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={() => handleChange('visibility', 'public')} className={`rounded-2xl border px-4 py-3 text-left transition-colors ${formData.visibility === 'public' ? 'border-[#0f9b8e] bg-[#0f9b8e]/10 text-white' : 'border-[#2a2a4a] bg-[#0d0d1a] text-gray-300'}`}>
                  <p className="font-semibold">{t('publicGame')}</p>
                  <p className="text-xs text-gray-400 mt-1">{t('publicGameDesc')}</p>
                </button>
                <button type="button" onClick={() => handleChange('visibility', 'private')} className={`rounded-2xl border px-4 py-3 text-left transition-colors ${formData.visibility === 'private' ? 'border-[#0f9b8e] bg-[#0f9b8e]/10 text-white' : 'border-[#2a2a4a] bg-[#0d0d1a] text-gray-300'}`}>
                  <p className="font-semibold">{t('privateGame')}</p>
                  <p className="text-xs text-gray-400 mt-1">{t('privateGameDesc')}</p>
                </button>
              </div>
            </div>
          </div>
        </div>

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

      </div>
    </PageShell>
  );
}
