export function hasWarmupInProgress({
  warmupStartedAtMs = null,
  warmupAccumulatedMs = 0,
}) {
  return warmupStartedAtMs != null || Number(warmupAccumulatedMs || 0) > 0;
}

export function shouldLockWarmupControls({
  isWarmupCompleted = false,
  warmupStartedAtMs = null,
  warmupAccumulatedMs = 0,
}) {
  return !isWarmupCompleted && hasWarmupInProgress({ warmupStartedAtMs, warmupAccumulatedMs });
}

export function isWarmupControlsActive({
  isWarmupRunning = false,
  isWarmupCompleted = false,
  warmupStartedAtMs = null,
  warmupAccumulatedMs = 0,
}) {
  return isWarmupRunning || isWarmupCompleted || hasWarmupInProgress({ warmupStartedAtMs, warmupAccumulatedMs });
}

export function canInteractWithSpeedMeter({
  isSpectator = false,
  gameStarted = false,
  matchEnded = false,
  isWarmupCompleted = false,
  warmupStartedAtMs = null,
  warmupAccumulatedMs = 0,
}) {
  if (isSpectator) return false;
  if (matchEnded) return false;
  if (!gameStarted) return false;
  if (!isWarmupCompleted && hasWarmupInProgress({ warmupStartedAtMs, warmupAccumulatedMs })) {
    return false;
  }
  return true;
}

export function shouldPersistSpeedMeterSession({
  isSpectator = false,
  isHydratingSession = false,
  userId = null,
  gameStarted = false,
  isWarmupRunning = false,
  isWarmupCompleted = false,
  liveMatchId = null,
  warmupStartedAtMs = null,
  warmupAccumulatedMs = 0,
}) {
  if (isSpectator || isHydratingSession || !userId) return false;
  if (gameStarted || isWarmupRunning || isWarmupCompleted) return true;
  if (liveMatchId) return true;
  return hasWarmupInProgress({ warmupStartedAtMs, warmupAccumulatedMs });
}

export function canResumeClock({
  isSpectator = false,
  gameStarted = false,
  matchEnded = false,
}) {
  return !isSpectator && gameStarted && !matchEnded;
}

export function shouldScheduleSpeedMeterSessionSave({
  isSpectator = false,
  isHydratingSession = false,
  userId = null,
  gameStarted = false,
  isWarmupRunning = false,
  isWarmupCompleted = false,
  liveMatchId = null,
  warmupStartedAtMs = null,
  warmupAccumulatedMs = 0,
}) {
  return shouldPersistSpeedMeterSession({
    isSpectator,
    isHydratingSession,
    userId,
    gameStarted,
    isWarmupRunning,
    isWarmupCompleted,
    liveMatchId,
    warmupStartedAtMs,
    warmupAccumulatedMs,
  });
}

export function shouldPersistSpeedMeterMatch({
  isSpectator = false,
  gameStarted = false,
  liveMatchId = null,
}) {
  return !isSpectator && Boolean(gameStarted && liveMatchId);
}
