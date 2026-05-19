import React from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Settings, Gauge, History, ShieldCheck, LogOut, Play } from 'lucide-react';
import { createPageUrl } from '@/utils';
import { useAuth } from '@/lib/AuthContext';
import { useI18n } from '@/lib/i18n';
import PageShell from '@/components/PageShell';

export default function AdminDashboard() {
  const { user, isAdmin, isSpectator, logout } = useAuth();
  const { t } = useI18n();
  if (isSpectator) return <Navigate to={createPageUrl('SpectatorHub')} replace />;
  if (!isAdmin) return <Navigate to={createPageUrl('GameSetup')} replace />;

  const actions = [
    { key: 'create', label: t('createGame'), icon: Play, to: 'GameSetup' },
    { key: 'settings', label: t('settings'), icon: Settings, to: 'Settings' },
    { key: 'meter', label: t('measurement'), icon: Gauge, to: 'SpeedMeter' },
    { key: 'history', label: t('reports'), icon: History, to: 'MatchHistory' },
    { key: 'system', label: t('administration'), icon: ShieldCheck, to: 'AdminSystem' },
  ];

  return (
    <PageShell
      title={t('adminPanel')}
      backTo={createPageUrl('SpeedMeter')}
      headerRight={(
        <button onClick={logout} className="p-2 rounded-full bg-[#2a2a4a] hover:bg-[#3a3a5a]">
          <LogOut className="w-5 h-5 text-gray-300" />
        </button>
      )}
      contentClassName="pt-4"
    >
      <div className="max-w-lg mx-auto">
        <div className="bg-[#16213e] rounded-2xl p-6 border border-[#2a2a4a] mb-6">
          <p className="text-sm text-gray-400 mt-1">{user?.email}</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <Link key={action.key} to={createPageUrl(action.to)} className="bg-[#16213e] border border-[#2a2a4a] rounded-2xl p-4 hover:bg-[#1d274b] transition-colors">
                <Icon className="w-7 h-7 text-[#0f9b8e] mb-3" />
                <p className="font-semibold">{action.label}</p>
              </Link>
            );
          })}
        </div>
      </div>
    </PageShell>
  );
}
