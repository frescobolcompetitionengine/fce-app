import { resolveGameSessionStatus } from '@/lib/gameSessionState';

export function formatMatchDateTime(iso, language) {
  if (!iso) return { date: '-', time: '-' };
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString(language),
    time: d.toLocaleTimeString(language, { hour: '2-digit', minute: '2-digit' }),
  };
}

export function getMatchTitle(match, separator = ' - ') {
  return match?.duo_name || `${match?.left_name || '-'}${separator}${match?.right_name || '-'}`;
}

export function getMatchVisibility(match) {
  return match?.visibility === 'public' ? 'public' : 'private';
}

export function getMatchStatus(match) {
  return resolveGameSessionStatus(match);
}
