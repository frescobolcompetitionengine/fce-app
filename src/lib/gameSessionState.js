function hasWarmupProgress(session) {
  if (!session) return false;
  return Boolean(
    session.game_status === 'warmup'
    || (session.game_status === 'paused' && !session.warmup_completed && (
      session.is_warming_up
      || session.warmup_started_at_ms
      || Number(session.warmup_accumulated_ms || 0) > 0
    )),
  );
}

function hasLiveProgress(session) {
  if (!session) return false;
  return Boolean(
    session.game_status === 'live'
    || (session.game_status === 'paused' && (
      session.game_started
      || session.is_running
      || session.clock_started_at_ms
      || Number(session.clock_accumulated_ms || 0) > 0
    )),
  );
}

export function isGameSessionFinished(session) {
  return Boolean(session?.match_ended || session?.game_status === 'finished');
}

export function isGameSessionWarmup(session) {
  return !isGameSessionFinished(session) && hasWarmupProgress(session);
}

export function isGameSessionLive(session) {
  return !isGameSessionFinished(session) && hasLiveProgress(session);
}

export function isGameSessionActive(session) {
  return isGameSessionWarmup(session) || isGameSessionLive(session);
}

export function resolveGameSessionStatus(session) {
  if (isGameSessionWarmup(session)) return 'warmup';
  if (isGameSessionLive(session)) return 'live';
  return 'finished';
}
