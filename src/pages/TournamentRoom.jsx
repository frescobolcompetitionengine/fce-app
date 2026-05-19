import React from 'react';
import { Navigate, Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { useAuth } from '@/lib/AuthContext';
import { useI18n } from '@/lib/i18n';
import SpeedMeter from '@/pages/SpeedMeter';
import TournamentControlPanel from '@/components/TournamentControlPanel';

export default function TournamentRoom() {
  const { isAdmin, isTournament, isSpectator } = useAuth();
  const { t } = useI18n();

  if (isSpectator) return <Navigate to={createPageUrl('SpectatorHub')} replace />;
  if (!isTournament) return <Navigate to={isAdmin ? createPageUrl('AdminDashboard') : createPageUrl('GameSetup')} replace />;

  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-[#1a1a2e] to-[#0d0d1a] text-white">
      <div className="border-b border-white/8 px-4 py-3">
        <div className="mx-auto flex max-w-[1800px] items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-gray-500">{t('tournamentMode')}</p>
            <h1 className="truncate text-xl font-bold">{t('tournamentRoom')}</h1>
          </div>
          <Link
            to={createPageUrl('TournamentView')}
            target="_blank"
            rel="noreferrer"
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/10"
          >
            {t('openTournamentView')}
          </Link>
        </div>
      </div>

      <div className="grid min-h-[calc(100dvh-4.25rem)] gap-0 lg:grid-cols-[minmax(0,65fr)_minmax(320px,35fr)]">
        <div className="min-h-0 overflow-auto border-b border-white/8 lg:border-b-0 lg:border-r border-white/8">
          <SpeedMeter displayMode="embedded" />
        </div>
        <div className="min-h-0 overflow-auto">
          <TournamentControlPanel />
        </div>
      </div>
    </div>
  );
}
