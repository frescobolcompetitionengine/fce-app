import { isGameSessionActive } from '@/lib/gameSessionState';
import { getMatchStatus, getMatchVisibility } from '@/lib/matchPresentation';

export function statusBadgeClass(status) {
  if (status === 'warmup') {
    return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
  }
  return status === 'live'
    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
    : 'bg-slate-500/15 text-slate-300 border-slate-500/30';
}

export function buildSpectatorMatches(liveSessions = [], historyMatches = []) {
  const liveMatches = liveSessions
    .filter((match) => getMatchVisibility(match) === 'public' && isGameSessionActive(match))
    .map((match) => ({ ...match, game_status: getMatchStatus(match), source: 'session' }));

  const finishedMatches = historyMatches
    .filter((match) => getMatchVisibility(match) === 'public')
    .map((match) => ({ ...match, game_status: getMatchStatus(match), source: 'history' }));

  return {
    liveMatches,
    finishedMatches,
    publicMatches: [...liveMatches, ...finishedMatches],
  };
}
