import React, { useState } from 'react';
import { Eye, History, RefreshCw } from 'lucide-react';
import { Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import MatchReport from '@/components/MatchReport';
import { useAuth } from '@/lib/AuthContext';
import { formatMatchDateTime, getMatchStatus, getMatchTitle, getMatchVisibility } from '@/lib/matchPresentation';
import { useI18n } from '@/lib/i18n';
import { createSpeedScoreCalculator, resolveScoringConfiguration } from '@/lib/scoring';
import { listMatchHistory } from '@/services/matchHistoryRepository';
import { listGameSessions } from '@/services/gameSessionRepository';
import { createPageUrl } from '@/utils';
import { buildSpectatorMatches, statusBadgeClass } from '@/lib/spectatorHubView';

export default function SpectatorHub() {
  const { t, language } = useI18n();
  const { isSpectator, logout } = useAuth();
  const [selectedId, setSelectedId] = useState(null);

  const { data: liveSessions = [], isLoading: isLoadingLive, refetch: refetchLive, isFetching: isFetchingLive } = useQuery({
    queryKey: ['spectatorLiveSessions'],
    queryFn: () => listGameSessions('-updated_at', 200),
    refetchInterval: 2000,
  });

  const { data: historyMatches = [], isLoading: isLoadingHistory, refetch: refetchHistory, isFetching: isFetchingHistory } = useQuery({
    queryKey: ['spectatorHistoryMatches'],
    queryFn: () => listMatchHistory('-played_at', 200),
    refetchInterval: 2500,
  });

  if (!isSpectator) {
    return <Navigate to={createPageUrl('SpeedMeter')} replace />;
  }

  if (isLoadingLive || isLoadingHistory) {
    return <div className="min-h-[100dvh] bg-gradient-to-b from-[#1a1a2e] to-[#0d0d1a] flex items-center justify-center"><div className="animate-spin w-8 h-8 border-4 border-[#0f9b8e] border-t-transparent rounded-full" /></div>;
  }

  const { liveMatches, finishedMatches, publicMatches } = buildSpectatorMatches(liveSessions, historyMatches);
  const selected = publicMatches.find((match) => match.id === selectedId) || null;
  const dt = selected ? formatMatchDateTime(selected.played_at || selected.started_at || selected.created_at, language) : null;
  const selectedScoringConfig = resolveScoringConfiguration(selected?.scoring_mode || 'option_1', selected?.min_scoring_speed ?? 50);

  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-[#1a1a2e] to-[#0d0d1a] text-white pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
      <header className="sticky top-0 z-30 border-b border-white/8 bg-[#0d0d1a]/80 backdrop-blur-xl pt-[calc(0.75rem+env(safe-area-inset-top))]">
        <div className="flex items-center justify-between gap-3 px-4 pb-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/8 bg-white/5">
              <Eye className="h-5 w-5 text-[#0f9b8e]" />
            </div>
            <div>
              <h1 className="text-lg font-bold">{t('spectatorHubTitle')}</h1>
              <p className="text-xs text-gray-400">{t('spectatorHubDesc')}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="rounded-full bg-red-800/70 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-red-700"
          >
            {t('logout')}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pt-4">
        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="space-y-4">
            <div className="rounded-2xl border border-[#2a2a4a] bg-[#16213e] p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-[#0f9b8e]/15 p-3">
                  <History className="h-6 w-6 text-[#0f9b8e]" />
                </div>
                <div>
                  <p className="text-sm text-gray-400">{t('liveGames')}</p>
                  <p className="text-2xl font-bold">{liveMatches.length}</p>
                </div>
                <button onClick={() => { refetchLive(); refetchHistory(); }} className="ml-auto rounded-full bg-[#0d0d1a] p-2 text-gray-300 transition-colors hover:bg-[#1a1a2e]">
                  <RefreshCw className={`h-4 w-4 ${(isFetchingLive || isFetchingHistory) ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400">{t('liveGames')}</h2>
                <span className="text-xs text-gray-500">{t('publicGame')}</span>
              </div>
              {liveMatches.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[#2a2a4a] bg-[#16213e]/60 p-6 text-center text-gray-500">
                  {t('noMatchesYet')}
                </div>
              ) : (
                liveMatches.map((match) => {
                  const { date, time } = formatMatchDateTime(match.played_at || match.started_at || match.created_at, language);
                  return (
                    <button
                      key={match.id}
                      onClick={() => setSelectedId(match.id)}
                      className="flex w-full items-center justify-between gap-3 rounded-2xl border border-[#0f9b8e]/30 bg-[#16213e] p-4 text-left transition-colors hover:bg-[#1b2748]"
                    >
                      <div className="min-w-0">
                        <div className="mb-2 flex flex-wrap gap-2">
                          <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${statusBadgeClass(getMatchStatus(match))}`}>{getMatchStatus(match) === 'warmup' ? t('warmupStatus') : t('liveStatus')}</span>
                          <span className="rounded-full border border-[#2a2a4a] bg-[#0d0d1a] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-gray-300">{t('publicGame')}</span>
                        </div>
                        <p className="truncate text-base font-bold text-white">{getMatchTitle(match)}</p>
                        <p className="text-xs text-gray-400">{date} - {time}</p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-2 text-right">
                        <span className="text-xl font-bold text-[#0f9b8e]">{(match.total_score ?? 0).toLocaleString()}</span>
                        <span className="text-xs text-gray-400">{t('pts')}</span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400">{t('finishedGames')}</h2>
            </div>
          {finishedMatches.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#2a2a4a] bg-[#16213e]/60 p-6 text-center text-gray-500">
              {t('noMatchesYet')}
            </div>
          ) : (
              finishedMatches.map((match) => {
                const { date, time } = formatMatchDateTime(match.played_at || match.started_at || match.created_at, language);
                return (
                  <button
                    key={match.id}
                    onClick={() => setSelectedId(match.id)}
                    className="flex w-full items-center justify-between gap-3 rounded-2xl border border-[#2a2a4a] bg-[#16213e] p-4 text-left transition-colors hover:bg-[#1b2748]"
                  >
                    <div className="min-w-0">
                      <div className="mb-2 flex flex-wrap gap-2">
                        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${statusBadgeClass('finished')}`}>{t('finishedStatus')}</span>
                        <span className="rounded-full border border-[#2a2a4a] bg-[#0d0d1a] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-gray-300">{t('publicGame')}</span>
                      </div>
                      <p className="truncate text-base font-bold text-white">{getMatchTitle(match)}</p>
                      <p className="text-xs text-gray-400">{date} - {time}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2 text-right">
                      <span className="text-xl font-bold text-white">{(match.total_score ?? 0).toLocaleString()}</span>
                      <span className="text-xs text-gray-400">{t('pts')}</span>
                    </div>
                  </button>
                );
              })
            )}
          </section>
        </div>
      </main>

      {selected && (
        <MatchReport
          leftName={selected.left_name}
          rightName={selected.right_name}
          leftPhoto={selected.left_photo || ''}
          rightPhoto={selected.right_photo || ''}
          leftHits={selected.left_hits || []}
          rightHits={selected.right_hits || []}
          ballDropEvents={selected.ball_drop_events || []}
          totalScore={selected.total_score || 0}
          ballDrops={selected.ball_drops || 0}
          freeBallDrops={selected.free_ball_drops ?? 5}
          calculateScore={createSpeedScoreCalculator(selected?.scoring_mode || 'option_1', selected?.min_scoring_speed ?? 50)}
          continuityEnabled={selected.continuity_enabled ?? selectedScoringConfig.continuityEnabled}
          powerEnabled={selected.power_enabled ?? selectedScoringConfig.powerEnabled}
          matchStatus={getMatchStatus(selected)}
          visibility={getMatchVisibility(selected)}
          duoName={getMatchTitle(selected, ' & ')}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}
