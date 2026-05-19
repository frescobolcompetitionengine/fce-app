function toMs(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function getClockElapsedMs({
  clockStartedAtMs,
  clockAccumulatedMs = 0,
  nowMs = Date.now(),
}) {
  const startedAt = toMs(clockStartedAtMs);
  const runningElapsed = startedAt ? Math.max(0, nowMs - startedAt) : 0;
  return Math.max(0, clockAccumulatedMs) + runningElapsed;
}

export function getClockRemainingSeconds({
  matchDurationMs,
  clockStartedAtMs,
  clockAccumulatedMs = 0,
  nowMs = Date.now(),
}) {
  const elapsedMs = getClockElapsedMs({ clockStartedAtMs, clockAccumulatedMs, nowMs });
  return Math.max(0, Math.ceil((matchDurationMs - elapsedMs) / 1000));
}

export function startClock(refs, nowMs = Date.now()) {
  if (refs.clockStartedAtRef.current == null) {
    refs.clockStartedAtRef.current = nowMs;
  }
}

export function pauseClock(refs, nowMs = Date.now()) {
  if (refs.clockStartedAtRef.current == null) return;
  refs.clockAccumulatedMsRef.current += Math.max(0, nowMs - refs.clockStartedAtRef.current);
  refs.clockStartedAtRef.current = null;
}

export function resetClock(refs) {
  refs.clockStartedAtRef.current = null;
  refs.clockAccumulatedMsRef.current = 0;
}

export function getWarmupElapsedMs({
  warmupStartedAtMs,
  warmupAccumulatedMs = 0,
  nowMs = Date.now(),
}) {
  const startedAt = toMs(warmupStartedAtMs);
  const runningElapsed = startedAt ? Math.max(0, nowMs - startedAt) : 0;
  return Math.max(0, warmupAccumulatedMs) + runningElapsed;
}

export function getWarmupRemainingSeconds({
  warmupDurationMs,
  warmupStartedAtMs,
  warmupAccumulatedMs = 0,
  nowMs = Date.now(),
}) {
  const elapsedMs = getWarmupElapsedMs({ warmupStartedAtMs, warmupAccumulatedMs, nowMs });
  return Math.max(0, Math.ceil((warmupDurationMs - elapsedMs) / 1000));
}

export function startWarmupClock(refs, nowMs = Date.now()) {
  if (refs.warmupStartedAtRef.current == null) {
    refs.warmupStartedAtRef.current = nowMs;
  }
}

export function pauseWarmupClock(refs, nowMs = Date.now()) {
  if (refs.warmupStartedAtRef.current == null) return;
  refs.warmupAccumulatedMsRef.current += Math.max(0, nowMs - refs.warmupStartedAtRef.current);
  refs.warmupStartedAtRef.current = null;
}

export function resetWarmupClock(refs, warmupDuration, setters = {}) {
  refs.warmupStartedAtRef.current = null;
  refs.warmupAccumulatedMsRef.current = 0;
  setters.setWarmupTimeLeft?.(warmupDuration);
  setters.setIsWarmupRunning?.(false);
  setters.setIsWarmupCompleted?.(false);
  setters.setIsWarmupModalOpen?.(false);
}

export function completeWarmup(refs, setters = {}, nowMs = Date.now()) {
  pauseWarmupClock(refs, nowMs);
  setters.setWarmupTimeLeft?.(0);
  setters.setIsWarmupRunning?.(false);
  setters.setIsWarmupCompleted?.(true);
}
