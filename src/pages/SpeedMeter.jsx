import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Settings as SettingsIcon, History, ShieldCheck } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { useQuery } from '@tanstack/react-query';
import Timer from '@/components/Timer';
import ParticipantCard from '@/components/ParticipantCard';
import ScoreDisplay from '@/components/ScoreDisplay';
import PassButton from '@/components/PassButton';
import PauseButton from '@/components/PauseButton';
import BallDropButton from '@/components/BallDropButton';
import BallDropUndoButton from '@/components/BallDropUndoButton';
import MatchReport from '@/components/MatchReport';
import { playSpeedSound, playClickSound, playWarmupEndSound } from '@/lib/speedSounds';
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/lib/AuthContext';
import { isGameSessionActive } from '@/lib/gameSessionState';
import {
  buildSpeedMeterSessionPayload,
  resolveSpeedMeterSessionHydration,
  resolveSpeedMeterSessionStatus,
} from '@/lib/speedMeterSession';
import { createBallDropEvent, createPassOutcome } from '@/lib/speedMeterGameplay';
import {
  completeWarmup as completeWarmupClock,
  getClockElapsedMs,
  getClockRemainingSeconds,
  getWarmupRemainingSeconds as getWarmupRemainingSecondsClock,
  pauseClock as pauseClockClock,
  pauseWarmupClock as pauseWarmupClockClock,
  resetClock as resetClockClock,
  resetWarmupClock as resetWarmupClockClock,
  startClock as startClockClock,
  startWarmupClock as startWarmupClockClock,
} from '@/lib/speedMeterClock';
import {
  canInteractWithSpeedMeter,
  canResumeClock,
  hasWarmupInProgress,
  isWarmupControlsActive,
  shouldPersistSpeedMeterMatch,
  shouldScheduleSpeedMeterSessionSave,
  shouldLockWarmupControls,
} from '@/lib/speedMeterState';
import { buildSpeedMeterMatchPayload } from '@/lib/speedMeterMatch';
import { listenTournamentControl } from '@/lib/tournamentControlBus';
import { applyBalanceRule, computeAthleteScore, createSpeedScoreCalculator, resolveScoringConfiguration } from '@/lib/scoring';
import { loadLatestSettingsForUser, SETTINGS_PROFILE_DEFAULTS } from '@/services/settingsRepository';
import { createMatchHistory, deleteMatchHistory, updateMatchHistory } from '@/services/matchHistoryRepository';
import { createGameSession, clearActiveGameSessions, finalizeGameSession, getLatestGameSession, updateGameSession } from '@/services/gameSessionRepository';

const DEFAULT_SETTINGS = {
  ...SETTINGS_PROFILE_DEFAULTS,
  match_duration_minutes: 5,
};

const GENERIC_TEAM_NAME_PATTERN = /^[A-Z]{3}\s[A-Z]\s&\s[A-Z]{3}\s[A-Z]$/;
const GENERIC_PLAYER_NAME_PATTERN = /^(?:Player|Jogador|ãƒ—ãƒ¬ã‚¤ãƒ¤ãƒ¼)\s*[12]$/u;

const normalizeDisplayedValue = (value, pattern) => {
  const normalized = String(value ?? '').trim();
  if (!normalized) return '';
  return pattern.test(normalized) ? '' : normalized;
};

export default function SpeedMeter({ displayMode = 'full' }) {
  const { t } = useI18n();
  const { user, isSpectator, logout } = useAuth();
  const location = useLocation();
  const isEmbedded = displayMode !== 'full';
  const [timeLeft, setTimeLeft] = useState(5 * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [warmupTimeLeft, setWarmupTimeLeft] = useState(5 * 60);
  const [isWarmupRunning, setIsWarmupRunning] = useState(false);
  const [isWarmupCompleted, setIsWarmupCompleted] = useState(false);
  const [isWarmupModalOpen, setIsWarmupModalOpen] = useState(false);

  // All recorded hits per side: { speed, timestamp (seconds elapsed), scored }
  const [leftHits, setLeftHits] = useState([]); // array of { speed, t }
  const [rightHits, setRightHits] = useState([]);

  const [leftCurrentSpeed, setLeftCurrentSpeed] = useState(0);
  const [rightCurrentSpeed, setRightCurrentSpeed] = useState(0);

  const [ballDrops, setBallDrops] = useState(0);
  const [ballDropEvents, setBallDropEvents] = useState([]);
  const [restTimeLeft, setRestTimeLeft] = useState(90); // starts at 90s, counts down during resting
  const [isResting, setIsResting] = useState(false);

  const [showReport, setShowReport] = useState(false);
  const [matchEnded, setMatchEnded] = useState(false);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);

  const [lastPressTime, setLastPressTime] = useState(null);
  const [lastPressSide, setLastPressSide] = useState(null);
  const [lastLeftSpeed, setLastLeftSpeed] = useState(0);
  const [lastRightSpeed, setLastRightSpeed] = useState(0);

  const [gameStarted, setGameStarted] = useState(false);
  const gameElapsed = useRef(0); // seconds elapsed since game start (for timestamps)
  const clockStartedAtRef = useRef(null);
  const clockAccumulatedMsRef = useRef(0);
  const warmupStartedAtRef = useRef(null);
  const warmupAccumulatedMsRef = useRef(0);
  const warmupFinishTimerRef = useRef(null);
  const [liveMatchId, setLiveMatchId] = useState(null);
  const [isHydratingSession, setIsHydratingSession] = useState(true);
  const sessionSaveTimerRef = useRef(null);
  const timerTickRef = useRef(null);

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      try {
        return await loadLatestSettingsForUser(user?.id, user?.email);
      } catch (error) {
        console.warn('Using local fallback settings:', error);
        return DEFAULT_SETTINGS;
      }
    }
  });

  const effectiveSettings = settings ?? DEFAULT_SETTINGS;

  const distance = effectiveSettings.distance_meters;
  const matchDuration = effectiveSettings.match_duration_minutes * 60;
  const matchDurationMs = matchDuration * 1000;
  const warmupDurationMinutes = effectiveSettings.warmup_duration_minutes ?? effectiveSettings.match_duration_minutes ?? 5;
  const warmupDuration = Math.max(0, warmupDurationMinutes * 60);
  const warmupDurationMs = warmupDuration * 1000;
  const leftName = normalizeDisplayedValue(effectiveSettings.player_left_name, GENERIC_PLAYER_NAME_PATTERN) || t('leftPlayer');
  const rightName = normalizeDisplayedValue(effectiveSettings.player_right_name, GENERIC_PLAYER_NAME_PATTERN) || t('rightPlayer');
  const leftPhoto = effectiveSettings.player_left_photo || '';
  const rightPhoto = effectiveSettings.player_right_photo || '';
  const leftRadarEnabled = Boolean(effectiveSettings.player_left_radar_enabled);
  const rightRadarEnabled = Boolean(effectiveSettings.player_right_radar_enabled);
  const duoName = normalizeDisplayedValue(effectiveSettings.duo_name, GENERIC_TEAM_NAME_PATTERN) || `${leftName} & ${rightName}`;
  const visibility = effectiveSettings.visibility === 'public' ? 'public' : 'private';
  const freeBallDrops = effectiveSettings.free_ball_drops ?? 5;
  const maxBallDrops = effectiveSettings.max_ball_drops ?? 20;
  const countBallDrops = effectiveSettings.count_ball_drops ?? true;
  const scoringConfig = useMemo(() => resolveScoringConfiguration(
    effectiveSettings.scoring_mode || 'option_1',
    effectiveSettings.min_scoring_speed ?? 50,
    {
      balanceEnabled: effectiveSettings.balance_enabled,
      continuityEnabled: effectiveSettings.continuity_enabled,
      powerEnabled: effectiveSettings.power_enabled,
    },
  ), [
    effectiveSettings.scoring_mode,
    effectiveSettings.min_scoring_speed,
    effectiveSettings.balance_enabled,
    effectiveSettings.continuity_enabled,
    effectiveSettings.power_enabled,
  ]);
  const {
    scoringMode,
    minScoringSpeed,
    balanceEnabled,
    continuityEnabled,
    powerEnabled,
  } = scoringConfig;

  const warmupInProgress = hasWarmupInProgress({
    warmupStartedAtMs: warmupStartedAtRef.current,
    warmupAccumulatedMs: warmupAccumulatedMsRef.current,
  });
  const warmupControlsActive = isWarmupControlsActive({
    isWarmupRunning,
    isWarmupCompleted,
    warmupStartedAtMs: warmupStartedAtRef.current,
    warmupAccumulatedMs: warmupAccumulatedMsRef.current,
  });
  const warmupControlsLocked = shouldLockWarmupControls({
    isWarmupCompleted,
    warmupStartedAtMs: warmupStartedAtRef.current,
    warmupAccumulatedMs: warmupAccumulatedMsRef.current,
  });

  const clockRefs = useMemo(() => ({
    clockStartedAtRef,
    clockAccumulatedMsRef,
    warmupStartedAtRef,
    warmupAccumulatedMsRef,
  }), []);

  const getElapsedClockMs = useCallback((nowMs = Date.now()) => getClockElapsedMs({
    clockStartedAtMs: clockStartedAtRef.current,
    clockAccumulatedMs: clockAccumulatedMsRef.current,
    nowMs,
  }), []);

  const getRemainingClockSeconds = useCallback((nowMs = Date.now()) => getClockRemainingSeconds({
    matchDurationMs,
    clockStartedAtMs: clockStartedAtRef.current,
    clockAccumulatedMs: clockAccumulatedMsRef.current,
    nowMs,
  }), [matchDurationMs]);

  const startClock = useCallback((nowMs = Date.now()) => startClockClock(clockRefs, nowMs), [clockRefs]);

  const pauseClock = useCallback((nowMs = Date.now()) => pauseClockClock(clockRefs, nowMs), [clockRefs]);

  const resetClock = useCallback(() => resetClockClock(clockRefs), [clockRefs]);

  const getWarmupRemainingSeconds = useCallback((nowMs = Date.now()) => getWarmupRemainingSecondsClock({
    warmupDurationMs,
    warmupStartedAtMs: warmupStartedAtRef.current,
    warmupAccumulatedMs: warmupAccumulatedMsRef.current,
    nowMs,
  }), [warmupDurationMs]);

  const startWarmupClock = useCallback((nowMs = Date.now()) => startWarmupClockClock(clockRefs, nowMs), [clockRefs]);

  const pauseWarmupClock = useCallback((nowMs = Date.now()) => pauseWarmupClockClock(clockRefs, nowMs), [clockRefs]);

  const resetWarmupClock = useCallback(() => resetWarmupClockClock(clockRefs, warmupDuration, {
    setWarmupTimeLeft,
    setIsWarmupRunning,
    setIsWarmupCompleted,
    setIsWarmupModalOpen,
  }), [clockRefs, warmupDuration]);

  const completeWarmup = useCallback((nowMs = Date.now()) => completeWarmupClock(clockRefs, {
    setWarmupTimeLeft,
    setIsWarmupRunning,
    setIsWarmupCompleted,
  }, nowMs), [clockRefs]);

  const clearWarmupFinishTimer = useCallback(() => {
    if (warmupFinishTimerRef.current != null) {
      clearTimeout(warmupFinishTimerRef.current);
      warmupFinishTimerRef.current = null;
    }
  }, []);

  const closeWarmupModal = useCallback(() => {
    clearWarmupFinishTimer();
    setIsWarmupModalOpen(false);
  }, [clearWarmupFinishTimer]);

  const serializeLiveSession = useCallback((status = resolveSpeedMeterSessionStatus({ isWarmupRunning, matchEnded, isRunning })) => buildSpeedMeterSessionPayload({
    status,
    liveMatchId,
    user,
    state: {
      isRunning,
      gameStarted,
      matchEnded,
      ballDrops,
      ballDropEvents,
      restTimeLeft,
      isResting,
      warmupTimeLeft,
      isWarmupRunning,
      isWarmupCompleted,
      leftHits,
      rightHits,
      leftCurrentSpeed,
      rightCurrentSpeed,
      lastPressTime,
      lastPressSide,
      lastLeftSpeed,
      lastRightSpeed,
      gameElapsedSeconds: gameElapsed.current,
    },
    refs: {
      warmupStartedAtMs: warmupStartedAtRef.current,
      warmupAccumulatedMs: warmupAccumulatedMsRef.current,
      clockStartedAtMs: clockStartedAtRef.current,
      clockAccumulatedMs: clockAccumulatedMsRef.current,
    },
    derived: {
      getRemainingClockSeconds,
      warmupDurationMinutes,
      leftName,
      rightName,
      leftPhoto,
      rightPhoto,
      leftRadarEnabled,
      rightRadarEnabled,
      duoName,
      visibility,
      distance,
      matchDurationMinutes: effectiveSettings.match_duration_minutes || 5,
      scoringMode,
      balanceEnabled,
      continuityEnabled,
      powerEnabled,
      minScoringSpeed,
      countBallDrops,
      freeBallDrops,
    },
  }), [
    ballDropEvents,
    ballDrops,
    balanceEnabled,
    continuityEnabled,
    countBallDrops,
    duoName,
    effectiveSettings.match_duration_minutes,
    freeBallDrops,
    gameStarted,
    getRemainingClockSeconds,
    isResting,
    isWarmupCompleted,
    isWarmupRunning,
    isRunning,
    lastLeftSpeed,
    lastPressSide,
    lastPressTime,
    leftCurrentSpeed,
    leftHits,
    leftName,
    leftPhoto,
    leftRadarEnabled,
    liveMatchId,
    matchEnded,
    minScoringSpeed,
    powerEnabled,
    restTimeLeft,
    rightCurrentSpeed,
    rightHits,
    rightName,
    rightPhoto,
    rightRadarEnabled,
    scoringMode,
    user,
    visibility,
    warmupDurationMinutes,
    warmupTimeLeft,
  ]);

  const saveLiveSession = useCallback(async (status) => {
    if (isSpectator || !user?.id || (!gameStarted && !isWarmupRunning && !isWarmupCompleted && !liveMatchId)) return null;

    const payload = serializeLiveSession(status);
    const nextStatus = status || payload.game_status;

    if (nextStatus === 'finished' && liveMatchId) {
      const finalized = await finalizeGameSession(liveMatchId, payload);
      if (finalized) return finalized;
    }

    if (liveMatchId) {
      const updated = await updateGameSession(liveMatchId, payload);
      if (updated) return updated;
    }

    const created = await createGameSession({ ...payload, game_status: nextStatus });
    if (created?.id) {
      setLiveMatchId(created.id);
    }
    return created;
  }, [gameStarted, isSpectator, isWarmupCompleted, isWarmupRunning, liveMatchId, serializeLiveSession, user?.id]);

  useEffect(() => {
    if (!gameStarted && settings?.match_duration_minutes) {
      resetClock();
      setTimeLeft(settings.match_duration_minutes * 60);
    }
  }, [gameStarted, resetClock, settings?.match_duration_minutes]);

  useEffect(() => {
    if (!warmupInProgress && !isWarmupCompleted) {
      setWarmupTimeLeft(warmupDuration);
    }
  }, [isWarmupCompleted, warmupDuration, warmupInProgress]);

  useEffect(() => {
    let cancelled = false;

    if (!settings || isSpectator || !user?.id) {
      setIsHydratingSession(false);
      return () => {
        cancelled = true;
      };
    }

    (async () => {
      try {
        const activeSession = await getLatestGameSession(user.id);
        if (cancelled) return;

        if (!isGameSessionActive(activeSession)) {
          resetClock();
          resetWarmupClock();
          setIsHydratingSession(false);
          return;
        }

        const hydrated = resolveSpeedMeterSessionHydration(activeSession, {
          defaultMatchDurationMinutes: settings.match_duration_minutes ?? 5,
          defaultWarmupDurationMinutes: warmupDurationMinutes,
          getRemainingClockSeconds,
          getWarmupRemainingSeconds,
          matchDurationMs,
          warmupDuration,
        });

        if (!hydrated) {
          resetClock();
          resetWarmupClock();
          setIsHydratingSession(false);
          return;
        }

        setLiveMatchId(hydrated.liveMatchId);
        setTimeLeft(hydrated.timeLeft);
        setIsRunning(hydrated.isRunning);
        setGameStarted(hydrated.gameStarted);
        setMatchEnded(hydrated.matchEnded);
        setBallDrops(hydrated.ballDrops);
        setBallDropEvents(hydrated.ballDropEvents);
        setRestTimeLeft(hydrated.restTimeLeft);
        setIsResting(hydrated.isResting);
        setLeftHits(hydrated.leftHits);
        setRightHits(hydrated.rightHits);
        setLeftCurrentSpeed(hydrated.leftCurrentSpeed);
        setRightCurrentSpeed(hydrated.rightCurrentSpeed);
        setLastPressTime(hydrated.lastPressTime);
        setLastPressSide(hydrated.lastPressSide);
        setLastLeftSpeed(hydrated.lastLeftSpeed);
        setLastRightSpeed(hydrated.lastRightSpeed);
        gameElapsed.current = hydrated.gameElapsedSeconds;
        setWarmupTimeLeft(hydrated.warmupTimeLeft);
        setIsWarmupRunning(hydrated.isWarmupRunning);
        setIsWarmupCompleted(hydrated.isWarmupCompleted);
        clockAccumulatedMsRef.current = hydrated.refs.clockAccumulatedMs;
        clockStartedAtRef.current = hydrated.refs.clockStartedAtMs;
        warmupAccumulatedMsRef.current = hydrated.refs.warmupAccumulatedMs;
        warmupStartedAtRef.current = hydrated.refs.warmupStartedAtMs;
      } finally {
        if (!cancelled) {
          setIsHydratingSession(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [getRemainingClockSeconds, getWarmupRemainingSeconds, isSpectator, matchDurationMs, resetClock, resetWarmupClock, settings?.id, settings?.match_duration_minutes, user?.id, warmupDuration, warmupDurationMinutes]);

  const calculateScore = useMemo(() => createSpeedScoreCalculator(scoringMode, minScoringSpeed), [minScoringSpeed, scoringMode]);

  // Rest timer (90s after ball drop)
  useEffect(() => {
    let interval;
    if (isResting && restTimeLeft > 0) {
      interval = setInterval(() => {
        setRestTimeLeft(prev => {
          if (prev <= 1) {
            setIsResting(false);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isResting, restTimeLeft]);

  // Warmup timer
  useEffect(() => {
    if (isSpectator || warmupDuration <= 0) return undefined;

    const syncWarmupClock = () => {
      const remaining = getWarmupRemainingSeconds();
      if (warmupStartedAtRef.current == null) {
        if (warmupAccumulatedMsRef.current === 0 && !isWarmupCompleted) {
          setWarmupTimeLeft(warmupDuration);
        } else {
          setWarmupTimeLeft(remaining);
        }
        return;
      }

      setWarmupTimeLeft(remaining);
      if (!isWarmupRunning || isWarmupCompleted) {
        return;
      }

      if (remaining > 0) {
        return;
      }

      if (warmupFinishTimerRef.current != null) {
        return;
      }

      completeWarmup();
      playWarmupEndSound();
      warmupFinishTimerRef.current = setTimeout(() => {
        warmupFinishTimerRef.current = null;
        closeWarmupModal();
      }, 3000);
    };

    syncWarmupClock();
    if (!isWarmupRunning) return undefined;

    const interval = setInterval(syncWarmupClock, 1000);
    return () => {
      clearInterval(interval);
    };
  }, [closeWarmupModal, completeWarmup, getWarmupRemainingSeconds, isSpectator, isWarmupCompleted, isWarmupRunning, warmupDuration]);

  useEffect(() => () => {
    clearWarmupFinishTimer();
  }, [clearWarmupFinishTimer]);

  // Derived stats from hits arrays
  const leftSpeeds = useMemo(() => leftHits.map((h) => h.speed), [leftHits]);
  const rightSpeeds = useMemo(() => rightHits.map((h) => h.speed), [rightHits]);

  const leftMaxSpeed = useMemo(() => (leftSpeeds.length ? Math.max(...leftSpeeds) : 0), [leftSpeeds]);
  const leftMinSpeed = useMemo(() => (leftSpeeds.length ? Math.min(...leftSpeeds) : 0), [leftSpeeds]);
  const rightMaxSpeed = useMemo(() => (rightSpeeds.length ? Math.max(...rightSpeeds) : 0), [rightSpeeds]);
  const rightMinSpeed = useMemo(() => (rightSpeeds.length ? Math.min(...rightSpeeds) : 0), [rightSpeeds]);

  const leftTotalPasses = leftHits.length;
  const rightTotalPasses = rightHits.length;

  const leftQualityPasses = useMemo(() => leftSpeeds.filter((s) => s >= minScoringSpeed).length, [leftSpeeds, minScoringSpeed]);
  const rightQualityPasses = useMemo(() => rightSpeeds.filter((s) => s >= minScoringSpeed).length, [rightSpeeds, minScoringSpeed]);

  // Ranked score: top 150 hits per player, sorted by speed asc -> take last 150
  const leftRawScore = useMemo(() => computeAthleteScore(leftHits, calculateScore, { continuityEnabled, powerEnabled }), [leftHits, calculateScore, continuityEnabled, powerEnabled]);
  const rightRawScore = useMemo(() => computeAthleteScore(rightHits, calculateScore, { continuityEnabled, powerEnabled }), [rightHits, calculateScore, continuityEnabled, powerEnabled]);
  const balancedScores = useMemo(() => applyBalanceRule(leftRawScore, rightRawScore, balanceEnabled), [leftRawScore, rightRawScore, balanceEnabled]);
  const leftIndividualScore = useMemo(() => Math.round(balancedScores.left), [balancedScores.left]);
  const rightIndividualScore = useMemo(() => Math.round(balancedScores.right), [balancedScores.right]);

  // Total score = sum of both individual scores, with ball-drop penalty applied
  const baseScore = leftIndividualScore + rightIndividualScore;
  const penaltyDrops = Math.max(0, ballDrops - freeBallDrops);
  const penalty = useMemo(() => (penaltyDrops > 0 ? Math.pow(0.97, penaltyDrops) : 1), [penaltyDrops]);
  const totalScore = useMemo(() => Math.round(baseScore * penalty), [baseScore, penalty]);

  const playerCardLabels = useMemo(() => ({
    max: t('max'),
    min: t('min'),
    total: t('total'),
    minSpeedTag: `${t('atLeast')}${minScoringSpeed} Km/h`,
    pts: t('pts'),
  }), [minScoringSpeed, t]);

  const scoreDisplayLabels = useMemo(() => ({
    score: t('score'),
    passes: t('passes'),
  }), [t]);

  const passButtonLabels = useMemo(() => ({
    left: t('left'),
    right: t('right'),
  }), [t]);

  const buildMatchPayload = useCallback((status) => buildSpeedMeterMatchPayload({
    status,
    visibility,
    duoName,
    leftName,
    rightName,
    leftPhoto,
    rightPhoto,
    leftRadarEnabled,
    rightRadarEnabled,
    timeLeft: getRemainingClockSeconds(),
    clockStartedAtMs: clockStartedAtRef.current,
    clockAccumulatedMs: clockAccumulatedMsRef.current,
    leftHits,
    rightHits,
    ballDropEvents,
    totalScore,
    leftRawScore: Math.round(leftRawScore),
    rightRawScore: Math.round(rightRawScore),
    leftEffectiveScore: leftIndividualScore,
    rightEffectiveScore: rightIndividualScore,
    ballDrops,
    freeBallDrops,
    distanceMeters: distance,
    matchDurationMinutes: effectiveSettings.match_duration_minutes || 5,
    warmupDurationMinutes,
    scoringMode,
    balanceEnabled,
    continuityEnabled,
    powerEnabled,
    minScoringSpeed,
    countBallDrops,
    ownerUserId: user?.id,
    ownerEmail: user?.email,
    ownerName: `${user?.first_name || ''} ${user?.last_name || ''}`.trim(),
  }), [
    visibility,
    duoName,
    leftName,
    rightName,
    leftPhoto,
    rightPhoto,
    leftRadarEnabled,
    rightRadarEnabled,
    leftHits,
    rightHits,
    totalScore,
    leftRawScore,
    rightRawScore,
    leftIndividualScore,
    rightIndividualScore,
    ballDrops,
    ballDropEvents,
    freeBallDrops,
    getRemainingClockSeconds,
    distance,
    effectiveSettings.match_duration_minutes,
    warmupDurationMinutes,
    scoringMode,
    balanceEnabled,
    continuityEnabled,
    powerEnabled,
    minScoringSpeed,
    countBallDrops,
    user?.id,
    user?.email,
    user?.first_name,
    user?.last_name,
  ]);

  const persistLiveMatch = useCallback(async (status = 'live') => {
    if (isSpectator) return null;

    const payload = buildMatchPayload(status);
    const timestamp = new Date().toISOString();

    if (liveMatchId) {
      const patch = {
        ...payload,
        ...(status === 'finished' ? { finished_at: timestamp } : {}),
      };
      const updated = await updateMatchHistory(liveMatchId, patch);
      if (updated) return updated;
    }

    const created = await createMatchHistory({
      ...payload,
      played_at: timestamp,
      started_at: timestamp,
      ...(status === 'finished' ? { finished_at: timestamp } : {}),
    });
    setLiveMatchId(created.id);
    return created;
  }, [isSpectator, buildMatchPayload, liveMatchId]);

  useEffect(() => {
    if (!shouldScheduleSpeedMeterSessionSave({
      isSpectator,
      isHydratingSession,
      userId: user?.id,
      gameStarted,
      isWarmupRunning,
      isWarmupCompleted,
      liveMatchId,
      warmupStartedAtMs: warmupStartedAtRef.current,
      warmupAccumulatedMs: warmupAccumulatedMsRef.current,
    })) return undefined;
    if (sessionSaveTimerRef.current) {
      clearTimeout(sessionSaveTimerRef.current);
    }
    sessionSaveTimerRef.current = setTimeout(() => {
    void saveLiveSession(resolveSpeedMeterSessionStatus({ isWarmupRunning, matchEnded, isRunning }));
    }, 350);

    return () => {
      if (sessionSaveTimerRef.current) {
        clearTimeout(sessionSaveTimerRef.current);
      }
    };
  }, [
    ballDrops,
    gameStarted,
    isHydratingSession,
    isRunning,
    isResting,
    warmupTimeLeft,
    isWarmupCompleted,
    isWarmupRunning,
    ballDropEvents,
    lastLeftSpeed,
    lastPressSide,
    lastPressTime,
    lastRightSpeed,
    leftCurrentSpeed,
    leftHits,
    liveMatchId,
    matchEnded,
    restTimeLeft,
    rightCurrentSpeed,
    rightHits,
    saveLiveSession,
    user?.id,
  ]);

  // Main game timer
  useEffect(() => {
    if (!canResumeClock({
      isSpectator,
      gameStarted,
      matchEnded,
    })) return undefined;

    const syncClock = () => {
      if (clockStartedAtRef.current == null) {
        gameElapsed.current = Math.max(0, Math.floor(clockAccumulatedMsRef.current / 1000));
        if (clockAccumulatedMsRef.current > 0) {
          setTimeLeft(getRemainingClockSeconds());
        } else {
          setTimeLeft(matchDuration);
        }
        return;
      }

      const remaining = getRemainingClockSeconds();
      gameElapsed.current = Math.max(0, Math.floor(getElapsedClockMs() / 1000));
      setTimeLeft(remaining);

      if (remaining > 0 || !isRunning || matchEnded) {
        return;
      }

      pauseClock();
      setIsRunning(false);
      setMatchEnded(true);
      setTimeLeft(0);
      void persistLiveMatch('finished');
      void saveLiveSession('finished');
      setLiveMatchId(null);
    };

    syncClock();
    if (!isRunning || clockStartedAtRef.current == null) return undefined;

    const interval = setInterval(syncClock, 1000);
    return () => clearInterval(interval);
  }, [
    gameStarted,
    getElapsedClockMs,
    getRemainingClockSeconds,
    isRunning,
    isSpectator,
    matchEnded,
    pauseClock,
    persistLiveMatch,
    saveLiveSession,
  ]);

  const handleToggleTimer = useCallback(() => {
    if (isSpectator) return;
    if (warmupControlsLocked) return;

    const now = Date.now();
    const hasStartedClock = clockAccumulatedMsRef.current > 0 || clockStartedAtRef.current != null;

    if (!isRunning) {
      if (hasStartedClock) {
        startClock(now);
        setTimeLeft(getRemainingClockSeconds(now));
        setIsRunning(true);
        return;
      }

      resetClock();
      if (!gameStarted) {
        setGameStarted(true);
      }
      setTimeLeft(matchDuration);
      setIsRunning(true);
      return;
    }

    pauseClock(now);
    setTimeLeft(getRemainingClockSeconds(now));
    setIsRunning(false);
  }, [gameStarted, getRemainingClockSeconds, isRunning, isSpectator, isWarmupCompleted, matchDuration, pauseClock, resetClock, startClock]);

  const performResetTimer = useCallback(() => {
    if (isSpectator) return;
    setIsResetConfirmOpen(false);
    setIsRunning(false);
    setMatchEnded(false);
    setShowReport(false);
    setGameStarted(false);
    gameElapsed.current = 0;
    resetClock();
    resetWarmupClock();
    setTimeLeft(matchDuration);
    setLeftHits([]); setRightHits([]);
    setLeftCurrentSpeed(0); setRightCurrentSpeed(0);
    setBallDrops(0);
    setBallDropEvents([]);
    setRestTimeLeft(90);
    setIsResting(false);
    setLastPressTime(null); setLastPressSide(null);
    setLastLeftSpeed(0); setLastRightSpeed(0);
    void clearSessionArtifacts();
  }, [clearSessionArtifacts, isSpectator, matchDuration, resetClock, resetWarmupClock]);

  const handleResetTimer = useCallback(() => {
    if (isSpectator) return;
    if (gameStarted) {
      setIsResetConfirmOpen(true);
      return;
    }
    performResetTimer();
  }, [gameStarted, isSpectator, performResetTimer]);

  const handleWarmupToggle = useCallback(() => {
    if (isSpectator || warmupDuration <= 0) return;
    const now = Date.now();
    setIsWarmupModalOpen(true);

    if (isWarmupRunning) {
      pauseWarmupClock(now);
      setWarmupTimeLeft(getWarmupRemainingSeconds(now));
      setIsWarmupRunning(false);
      return;
    }

    if (!warmupInProgress && isWarmupCompleted) {
      resetWarmupClock();
    }

    startWarmupClock(now);
    setWarmupTimeLeft(getWarmupRemainingSeconds(now));
    setIsWarmupRunning(true);
    setIsWarmupCompleted(false);
  }, [getWarmupRemainingSeconds, isSpectator, isWarmupCompleted, isWarmupRunning, pauseWarmupClock, resetWarmupClock, startWarmupClock, warmupDuration, warmupInProgress]);

  const handleWarmupFinish = useCallback(() => {
    if (isSpectator || warmupDuration <= 0) return;
    completeWarmup();
    playWarmupEndSound();
    clearWarmupFinishTimer();
    warmupFinishTimerRef.current = setTimeout(() => {
      warmupFinishTimerRef.current = null;
      closeWarmupModal();
    }, 3000);
  }, [clearWarmupFinishTimer, closeWarmupModal, completeWarmup, isSpectator, warmupDuration]);

  const handleBallDrop = useCallback(() => {
    if (isSpectator) return;
    const newDrops = ballDrops + 1;
    const now = Date.now();
    gameElapsed.current = Math.max(0, Math.floor(getElapsedClockMs(now) / 1000));
    const dropEvent = createBallDropEvent({
      dropNumber: newDrops,
      timestampMs: now,
      elapsedSeconds: gameElapsed.current,
      responsibleSide: lastPressSide,
      leftName,
      rightName,
    });
    pauseClock();
    setBallDrops(newDrops);
    setBallDropEvents((prev) => [...prev, dropEvent]);
    setIsRunning(false);
    setIsResting(true);
    setTimeLeft(getRemainingClockSeconds(now));
    // Do NOT reset restTimeLeft â€” keep remaining time from previous rest
    setLastPressTime(null);
    setLastPressSide(null);
    // End match if drops limit reached
    if (countBallDrops && newDrops >= maxBallDrops) {
      setIsResting(false);
      setMatchEnded(true);
      void persistLiveMatch('finished');
      void saveLiveSession('finished');
      setLiveMatchId(null);
    }
  }, [ballDrops, countBallDrops, getElapsedClockMs, getRemainingClockSeconds, isSpectator, lastPressSide, leftName, maxBallDrops, pauseClock, persistLiveMatch, rightName, saveLiveSession]);

  const handleBallDropUndo = useCallback(() => {
    if (isSpectator) return;
    setBallDrops((prev) => Math.max(0, prev - 1));
    setBallDropEvents((prev) => (prev.length > 0 ? prev.slice(0, -1) : prev));
  }, [isSpectator]);

  async function clearSessionArtifacts() {
    const sessionId = liveMatchId
      || (user?.id ? (await getLatestGameSession(user.id))?.id : null);

    const activeIds = user?.id ? await clearActiveGameSessions(user.id) : [];
    const idsToRemove = new Set([sessionId, ...activeIds].filter(Boolean));

    await Promise.allSettled(Array.from(idsToRemove).map((id) => deleteMatchHistory(id)));

    setLiveMatchId(null);
  }

  const handlePass = useCallback((side) => {
    if (!canInteractWithSpeedMeter({
      isSpectator,
      gameStarted,
      matchEnded,
      isWarmupCompleted,
      warmupStartedAtMs: warmupStartedAtRef.current,
      warmupAccumulatedMs: warmupAccumulatedMsRef.current,
    })) return;

    const now = Date.now();

    // Resume game timer if paused; stop rest timer but KEEP remaining time
    if (clockStartedAtRef.current == null) {
      startClock(now);
    }
    if (!isRunning) {
      setTimeLeft(getRemainingClockSeconds(now));
      setIsRunning(true);
    }
    if (isResting) {
      setIsResting(false);
      // restTimeLeft stays as-is (not zeroed)
    }

    gameElapsed.current = Math.max(0, Math.floor(getElapsedClockMs(now) / 1000));
    const outcome = createPassOutcome({
      side,
      nowMs: now,
      lastPressTime,
      lastPressSide,
      distanceMeters: distance,
      elapsedSeconds: gameElapsed.current,
    });

    if (outcome.shouldPlaySpeedSound) {
      playSpeedSound(outcome.speedKmh);
      if (side === 'left') {
        setLeftHits((prev) => [...prev, outcome.hit]);
        setLeftCurrentSpeed(outcome.speedKmh);
        setLastLeftSpeed(outcome.speedKmh);
      } else {
        setRightHits((prev) => [...prev, outcome.hit]);
        setRightCurrentSpeed(outcome.speedKmh);
        setLastRightSpeed(outcome.speedKmh);
      }
    } else if (outcome.shouldPlayClickSound) {
      playClickSound();
    }

    setLastPressTime(now);
    setLastPressSide(side);
  }, [
    distance,
    gameStarted,
    getElapsedClockMs,
    getRemainingClockSeconds,
    isResting,
    isRunning,
    isSpectator,
    lastPressSide,
    lastPressTime,
    matchEnded,
    startClock,
    isWarmupCompleted,
  ]);

  useEffect(() => {
    if (displayMode === 'full') return undefined;

    const unsubscribe = listenTournamentControl((message) => {
      switch (message?.command) {
        case 'toggle_timer':
          handleToggleTimer();
          break;
        case 'toggle_warmup':
          handleWarmupToggle();
          break;
        case 'finish_warmup':
          handleWarmupFinish();
          break;
        case 'pass_left':
          handlePass('left');
          break;
        case 'pass_right':
          handlePass('right');
          break;
        case 'ball_drop':
          handleBallDrop();
          break;
        case 'undo_drop':
          handleBallDropUndo();
          break;
        case 'reset':
          handleResetTimer();
          break;
        default:
          break;
      }
    });

    return unsubscribe;
  }, [
    displayMode,
    handleBallDrop,
    handleBallDropUndo,
    handlePass,
    handleResetTimer,
    handleToggleTimer,
    handleWarmupFinish,
    handleWarmupToggle,
  ]);

  useEffect(() => {
    if (!shouldPersistSpeedMeterMatch({
      isSpectator,
      gameStarted,
      liveMatchId,
    })) return;
    void persistLiveMatch(matchEnded ? 'finished' : 'live');
  }, [
    gameStarted,
    isSpectator,
    liveMatchId,
    leftHits,
    rightHits,
    ballDrops,
    totalScore,
    leftRawScore,
    rightRawScore,
    leftIndividualScore,
    rightIndividualScore,
    matchEnded,
    persistLiveMatch,
  ]);

  return (
    <div className={isEmbedded ? 'h-full min-h-0 bg-transparent text-white' : 'min-h-[100dvh] bg-gradient-to-b from-[#1a1a2e] to-[#0d0d1a] text-white pb-[calc(8rem+env(safe-area-inset-bottom))]'}>
      {/* Header */}
      {isEmbedded ? (
        <div className="flex justify-center px-3 pt-3">
          <Timer
            timeLeft={timeLeft}
            isRunning={isRunning}
            onToggle={handleToggleTimer}
            onReset={handleResetTimer}
            onWarmupToggle={handleWarmupToggle}
            warmupActive={warmupControlsActive}
            toggleDisabled={warmupControlsLocked}
            showControls={false}
          />
        </div>
      ) : (
      <div className="grid grid-cols-3 items-start p-3">
        <div className="flex justify-start">
          {!isSpectator ? (
            <Link
              to={createPageUrl('MatchHistory')}
              className="p-1.5 rounded-full bg-[#2a2a4a] hover:bg-[#3a3a5a] transition-colors"
            >
              <History className="w-5 h-5 text-gray-300" />
            </Link>
          ) : <div className="w-8 h-8" />}
        </div>
        <div className="flex justify-center">
          <Timer
            timeLeft={timeLeft}
            isRunning={isRunning}
            onToggle={handleToggleTimer}
            onReset={handleResetTimer}
            onWarmupToggle={handleWarmupToggle}
            warmupActive={warmupControlsActive}
            toggleDisabled={warmupControlsLocked}
            showControls={!isEmbedded}
          />
        </div>
        <div className="flex justify-end">
          {!isSpectator ? (
            <div className="flex items-center gap-2">
              <Link
                to={createPageUrl('AdminSystem')}
                className="p-1.5 rounded-full bg-[#2a2a4a] hover:bg-[#3a3a5a] transition-colors"
              >
                <ShieldCheck className="w-5 h-5 text-gray-300" />
              </Link>
              <Link
                to={createPageUrl('Settings')}
                state={{ returnTo: location.pathname }}
                className="p-1.5 rounded-full bg-[#2a2a4a] hover:bg-[#3a3a5a] transition-colors"
              >
                <SettingsIcon className="w-5 h-5 text-gray-300" />
              </Link>
            </div>
          ) : (
            <button
              onClick={logout}
              className="px-3 py-1.5 rounded-full bg-red-800/70 hover:bg-red-700 text-xs font-semibold text-white transition-colors"
            >
              {t('logout')}
            </button>
          )}
        </div>
      </div>
      )}

      {/* Rest timer â€” always visible, no icon */}
      <div className="flex justify-center mt-1">
        <div className={`flex items-center gap-2 px-4 py-1.5 rounded-full border transition-all ${
          isResting && restTimeLeft > 0
            ? 'bg-orange-900/40 border-orange-700 animate-pulse'
            : restTimeLeft < 90
            ? 'bg-[#1a1a2e] border-orange-900/50'
            : 'bg-[#1a1a2e] border-[#2a2a4a]'
        }`}>
          <span className={`text-xs font-semibold ${isResting && restTimeLeft > 0 ? 'text-orange-300' : restTimeLeft < 90 ? 'text-orange-700' : 'text-gray-600'}`}>
            {t('rest')}
          </span>
          <span className={`text-sm font-bold tabular-nums ${isResting && restTimeLeft > 0 ? 'text-orange-300' : restTimeLeft < 90 ? 'text-orange-700' : 'text-gray-600'}`}>
            {String(Math.floor(restTimeLeft / 60)).padStart(2,'0')}:{String(restTimeLeft % 60).padStart(2,'0')}
          </span>
          {!isResting && restTimeLeft < 90 && restTimeLeft > 0 && (
            <span className="text-[10px] text-orange-800 font-semibold">{t('paused')}</span>
          )}
        </div>
      </div>

      {isWarmupModalOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-[2rem] border border-[#e94560]/30 bg-[#0d0d1a] p-8 shadow-2xl shadow-black/60 sm:p-9">
            <div className="flex flex-col items-center gap-7">
              {isWarmupCompleted ? (
                <div
                  className="mx-auto flex w-full max-w-[18rem] flex-col items-center justify-center text-center font-black uppercase tracking-[0.06em] text-amber-200 animate-[pulse_2.2s_ease-in-out_infinite] drop-shadow-[0_0_28px_rgba(251,191,36,0.38)] sm:max-w-[22rem]"
                  style={{ fontSize: 'clamp(1.35rem, 4.4vw, 2.65rem)', lineHeight: 0.94 }}
                >
                  <span>Aquecimento</span>
                  <span>Terminado</span>
                </div>
              ) : (
                <div
                  className={`font-bold tracking-tight leading-none tabular-nums ${
                    warmupTimeLeft <= 10
                      ? 'text-red-400 drop-shadow-[0_0_20px_rgba(248,113,113,0.25)]'
                      : warmupTimeLeft <= 60
                      ? 'text-amber-300 drop-shadow-[0_0_20px_rgba(251,191,36,0.22)]'
                      : 'text-emerald-400 drop-shadow-[0_0_20px_rgba(52,211,153,0.22)]'
                  }`}
                  style={{ fontSize: 'clamp(4.75rem, 18vw, 8.5rem)' }}
                >
                  {String(Math.floor(warmupTimeLeft / 60)).padStart(2, '0')}:{String(warmupTimeLeft % 60).padStart(2, '0')}
                </div>
              )}
              {isWarmupCompleted ? (
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-100/80">Aguarde...</p>
              ) : (
                <button
                  type="button"
                  onClick={handleWarmupFinish}
                  className="w-full rounded-full bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-500"
                >
                  {t('finishWarmup')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {isResetConfirmOpen && (
        <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/75 px-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-[2rem] border border-amber-500/30 bg-[#0d0d1a] p-7 shadow-2xl shadow-black/70 sm:p-8">
            <div className="flex flex-col gap-5">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-amber-500/30 bg-amber-500/15 text-amber-300">
                  <ShieldCheck className="h-6 w-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-200/70">{t('resetMatchDialogTitle')}</p>
                  <h3 className="mt-1 text-2xl font-black text-white">{t('resetMatchDialogTitle')}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-gray-300">{t('resetMatchDialogDesc')}</p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setIsResetConfirmOpen(false)}
                  className="w-full rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-gray-200 transition-colors hover:bg-white/10"
                >
                  {t('resetMatchDialogCancel')}
                </button>
                <button
                  type="button"
                  onClick={performResetTimer}
                  className="w-full rounded-full bg-amber-500 px-5 py-3 text-sm font-semibold text-[#0d0d1a] transition-colors hover:bg-amber-400"
                >
                  {t('resetMatchDialogConfirm')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="px-3 mt-3">
        <div className="flex justify-between items-center">
          <ParticipantCard
            name={leftName}
            photoUrl={leftPhoto}
            showRadar={leftRadarEnabled}
            currentSpeed={leftCurrentSpeed}
            maxSpeed={leftMaxSpeed}
            minSpeed={leftMinSpeed}
            qualityPasses={leftQualityPasses}
            totalPasses={leftTotalPasses}
            individualScore={leftIndividualScore}
            side="left"
            labels={{
              max: t('max'),
              min: t('min'),
              total: t('total'),
              minSpeedTag: `${t('atLeast')}${minScoringSpeed} Km/h`,
              pts: t('pts'),
            }}
          />

          <div className="flex flex-col items-center justify-center gap-1">
            <ScoreDisplay
              score={totalScore}
              elapsedPasses={leftTotalPasses + rightTotalPasses}
              labels={{ score: t('score'), passes: t('passes') }}
            />
            <span className="bg-[#1a1a2e] px-3 py-0.5 rounded-full border border-[#2a2a4a] text-gray-400 text-xs font-semibold mt-3 mb-3">
              {distance}m
            </span>
          </div>

          <ParticipantCard
            name={rightName}
            photoUrl={rightPhoto}
            showRadar={rightRadarEnabled}
            currentSpeed={rightCurrentSpeed}
            maxSpeed={rightMaxSpeed}
            minSpeed={rightMinSpeed}
            qualityPasses={rightQualityPasses}
            totalPasses={rightTotalPasses}
            individualScore={rightIndividualScore}
            side="right"
            labels={{
              max: t('max'),
              min: t('min'),
              total: t('total'),
              minSpeedTag: `${t('atLeast')}${minScoringSpeed} Km/h`,
              pts: t('pts'),
            }}
          />
        </div>
      </div>

      {/* Match ended banner */}
      {!isEmbedded && matchEnded && !showReport && (
        <div className="mx-4 mt-4 bg-[#0f9b8e]/20 border border-[#0f9b8e] rounded-2xl p-4 flex flex-col items-center gap-3">
          <span className="text-lg font-bold text-[#0f9b8e]">{t('matchEnded')}</span>
          <button
            onClick={() => setShowReport(true)}
            className="bg-[#0f9b8e] hover:bg-[#0d847a] text-white font-bold px-6 py-2 rounded-full text-sm transition-colors"
          >
            {t('viewReport')}
          </button>
        </div>
      )}

      {!isEmbedded && (
      <>
      {/* Pass buttons fixed left/right */}
      <PassButton
        side="left"
        onPress={() => handlePass('left')}
        disabled={isSpectator || !gameStarted || matchEnded}
        lastSpeed={lastLeftSpeed}
        labels={{ left: t('left'), right: t('right') }}
      />
      <PassButton
        side="right"
        onPress={() => handlePass('right')}
        disabled={isSpectator || !gameStarted || matchEnded}
        lastSpeed={lastRightSpeed}
        labels={{ left: t('left'), right: t('right') }}
      />

      {/* Pause + Ball drop + Undo drop â€” centered */}
      <div className="fixed left-1/2 bottom-[calc(1rem+env(safe-area-inset-bottom))] -translate-x-1/2 flex gap-3 z-50">
        <PauseButton isRunning={isRunning} onToggle={handleToggleTimer} disabled={warmupControlsLocked} />
        <BallDropButton
          count={ballDrops}
          onPress={handleBallDrop}
          disabled={isSpectator || !gameStarted}
        />
        <BallDropUndoButton
          onPress={handleBallDropUndo}
          disabled={isSpectator || !gameStarted || ballDrops === 0}
        />
      </div>

      {/* Match Report Modal */}
      {showReport && (
          <MatchReport
          leftName={leftName}
          rightName={rightName}
          leftPhoto={leftPhoto}
          rightPhoto={rightPhoto}
          leftHits={leftHits}
          rightHits={rightHits}
          ballDropEvents={ballDropEvents}
          totalScore={totalScore}
          ballDrops={ballDrops}
          freeBallDrops={freeBallDrops}
          calculateScore={calculateScore}
          continuityEnabled={continuityEnabled}
          powerEnabled={powerEnabled}
          matchStatus={matchEnded ? 'finished' : (isRunning || liveMatchId ? 'live' : undefined)}
          visibility={visibility}
          duoName={duoName}
          onClose={() => setShowReport(false)}
        />
      )}
      </>
      )}
    </div>
  );
}



