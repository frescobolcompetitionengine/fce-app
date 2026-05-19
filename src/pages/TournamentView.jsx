import React from 'react';
import { Navigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { useAuth } from '@/lib/AuthContext';
import { useI18n } from '@/lib/i18n';
import SpeedMeter from '@/pages/SpeedMeter';

export default function TournamentView() {
  const { isAdmin, isTournament, isSpectator } = useAuth();
  const { t } = useI18n();

  if (isSpectator) return <Navigate to={createPageUrl('SpectatorHub')} replace />;
  if (!isTournament) return <Navigate to={isAdmin ? createPageUrl('AdminDashboard') : createPageUrl('GameSetup')} replace />;

  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-[#1a1a2e] to-[#0d0d1a] text-white">
      <div className="border-b border-white/8 px-4 py-3">
        <div className="mx-auto max-w-[1800px]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-gray-500">{t('tournamentMode')}</p>
          <h1 className="truncate text-xl font-bold">{t('tournamentView')}</h1>
        </div>
      </div>
      <div className="min-h-[calc(100dvh-4.25rem)] overflow-auto">
        <SpeedMeter displayMode="embedded" />
      </div>
    </div>
  );
}
