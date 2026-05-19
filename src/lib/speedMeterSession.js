export function buildSpeedMeterSessionPayload({
  status,
  liveMatchId,
  user,
  state,
  refs,
  derived,
}) {
  return {
    id: liveMatchId || undefined,
    game_status: status,
    owner_user_id: user?.id,
    owner_email: user?.email,
    time_left: derived.getRemainingClockSeconds(),
    is_running: state.isRunning,
    game_started: state.gameStarted,
    match_ended: state.matchEnded,
    ball_drops: state.ballDrops,
    ball_drop_events: state.ballDropEvents,
    rest_time_left: state.restTimeLeft,
    is_resting: state.isResting,
    warmup_time_left: state.warmupTimeLeft,
    is_warming_up: state.isWarmupRunning,
    warmup_completed: state.isWarmupCompleted,
    warmup_started_at_ms: refs.warmupStartedAtMs,
    warmup_accumulated_ms: refs.warmupAccumulatedMs,
    warmup_duration_minutes: derived.warmupDurationMinutes,
    clock_started_at_ms: refs.clockStartedAtMs,
    clock_accumulated_ms: refs.clockAccumulatedMs,
    left_hits: state.leftHits,
    right_hits: state.rightHits,
    left_current_speed: state.leftCurrentSpeed,
    right_current_speed: state.rightCurrentSpeed,
    last_press_time: state.lastPressTime,
    last_press_side: state.lastPressSide,
    last_left_speed: state.lastLeftSpeed,
    last_right_speed: state.lastRightSpeed,
    game_elapsed_seconds: state.gameElapsedSeconds,
    left_name: derived.leftName,
    right_name: derived.rightName,
    left_photo: derived.leftPhoto,
    right_photo: derived.rightPhoto,
    player_left_radar_enabled: derived.leftRadarEnabled,
    player_right_radar_enabled: derived.rightRadarEnabled,
    duo_name: derived.duoName,
    visibility: derived.visibility,
    distance_meters: derived.distance,
    match_duration_minutes: derived.matchDurationMinutes,
    scoring_mode: derived.scoringMode,
    balance_enabled: derived.balanceEnabled,
    continuity_enabled: derived.continuityEnabled,
    power_enabled: derived.powerEnabled,
    min_scoring_speed: derived.minScoringSpeed,
    count_ball_drops: derived.countBallDrops,
    free_ball_drops: derived.freeBallDrops,
  };
}

export function resolveSpeedMeterSessionStatus({
  isWarmupRunning = false,
  matchEnded = false,
  isRunning = false,
}) {
  if (isWarmupRunning) return 'warmup';
  if (matchEnded) return 'finished';
  if (isRunning) return 'live';
  return 'paused';
}

export function resolveSpeedMeterSessionHydration(activeSession, {
  defaultMatchDurationMinutes,
  defaultWarmupDurationMinutes,
  getRemainingClockSeconds,
  getWarmupRemainingSeconds,
  matchDurationMs,
  warmupDuration,
}) {
  if (!activeSession) return null;

  const isRunning = Boolean(activeSession.is_running);
  const isWarmupRunning = Boolean(activeSession.is_warming_up);
  const timeLeft = activeSession.time_left ?? defaultMatchDurationMinutes * 60;
  const warmupTimeLeft = activeSession.warmup_time_left ?? warmupDuration;
  const hasClockMetadata = activeSession.clock_accumulated_ms != null || activeSession.clock_started_at_ms != null;
  const hasWarmupMetadata = activeSession.warmup_accumulated_ms != null || activeSession.warmup_started_at_ms != null;
  const clockAccumulatedMs = hasClockMetadata
    ? Math.max(0, Number(activeSession.clock_accumulated_ms ?? 0) || 0)
    : Math.max(0, matchDurationMs - Math.max(0, Number(timeLeft) || 0) * 1000);
  const clockStartedAtMs = hasClockMetadata
    ? (() => {
        const startedAt = Number(activeSession.clock_started_at_ms);
        return Number.isFinite(startedAt) && startedAt > 0 ? startedAt : null;
      })()
    : (isRunning ? Date.now() : null);
  const warmupAccumulatedMs = hasWarmupMetadata
    ? Math.max(0, Number(activeSession.warmup_accumulated_ms ?? 0) || 0)
    : 0;
  const warmupStartedAtMs = hasWarmupMetadata
    ? (() => {
        const startedAt = Number(activeSession.warmup_started_at_ms);
        return isWarmupRunning && Number.isFinite(startedAt) && startedAt > 0 ? startedAt : null;
      })()
    : null;

  return {
    liveMatchId: activeSession.id,
    timeLeft: hasClockMetadata
      ? getRemainingClockSeconds()
      : (isRunning ? getRemainingClockSeconds() : Math.max(0, Number(timeLeft) || 0)),
    isRunning,
    gameStarted: Boolean(activeSession.game_started ?? true),
    matchEnded: Boolean(activeSession.match_ended),
    ballDrops: activeSession.ball_drops ?? 0,
    ballDropEvents: Array.isArray(activeSession.ball_drop_events) ? activeSession.ball_drop_events : [],
    restTimeLeft: activeSession.rest_time_left ?? 90,
    isResting: Boolean(activeSession.is_resting),
    leftHits: Array.isArray(activeSession.left_hits) ? activeSession.left_hits : [],
    rightHits: Array.isArray(activeSession.right_hits) ? activeSession.right_hits : [],
    leftCurrentSpeed: activeSession.left_current_speed ?? 0,
    rightCurrentSpeed: activeSession.right_current_speed ?? 0,
    lastPressTime: activeSession.last_press_time ?? null,
    lastPressSide: activeSession.last_press_side ?? null,
    lastLeftSpeed: activeSession.last_left_speed ?? 0,
    lastRightSpeed: activeSession.last_right_speed ?? 0,
    gameElapsedSeconds: activeSession.game_elapsed_seconds ?? 0,
    warmupTimeLeft: hasWarmupMetadata
      ? (isWarmupRunning ? getWarmupRemainingSeconds() : Math.max(0, Number(warmupTimeLeft) || 0))
      : warmupDuration,
    isWarmupRunning,
    isWarmupCompleted: Boolean(activeSession.warmup_completed),
    refs: {
      clockAccumulatedMs,
      clockStartedAtMs,
      warmupAccumulatedMs,
      warmupStartedAtMs,
    },
  };
}
