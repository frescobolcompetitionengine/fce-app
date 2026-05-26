import React from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { Settings, Gauge, History, ShieldCheck, LogOut } from 'lucide-react';
import { createPageUrl } from '@/utils';
import { useAuth } from '@/lib/AuthContext';
import { useI18n } from '@/lib/i18n';
import PageShell from '@/components/PageShell';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

function getAccountDisplayName(user) {
  const fullName = [user?.first_name, user?.last_name].filter(Boolean).join(' ').trim();
  if (fullName) return fullName;
  const emailName = String(user?.email || '').split('@')[0].trim();
  if (emailName) return emailName;
  return 'utilizador';
}

export default function AdminDashboard() {
  const { user, isAdmin, isSpectator, logout } = useAuth();
  const { t } = useI18n();
  const location = useLocation();
  if (isSpectator) return <Navigate to={createPageUrl('SpectatorHub')} replace />;
  if (!isAdmin) return <Navigate to={createPageUrl('SpeedMeter')} replace />;

  const actions = [
    { key: 'settings', label: t('settings'), icon: Settings, to: 'Settings', tooltip: t('adminSettingsTooltip') },
    { key: 'meter', label: t('measurement'), icon: Gauge, to: 'SpeedMeter', tooltip: t('adminMeasurementTooltip') },
    { key: 'history', label: t('reports'), icon: History, to: 'MatchHistory', tooltip: t('adminReportsTooltip') },
    { key: 'system', label: t('administration'), icon: ShieldCheck, to: 'AdminSystem', tooltip: t('adminSystemTooltip') },
  ];
  const accountDisplayName = getAccountDisplayName(user);

  return (
    <TooltipProvider delayDuration={2000}>
      <PageShell
        title={t('adminPanel')}
        backTo={createPageUrl('SpeedMeter')}
        headerRight={(
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" onClick={logout} className="p-2 rounded-full bg-[#2a2a4a] hover:bg-[#3a3a5a]">
                <LogOut className="w-5 h-5 text-gray-300" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="bg-[#0d0d1a] border border-[#3a3a5a] text-white shadow-lg">
              {t('adminLogoutTooltip')}
            </TooltipContent>
          </Tooltip>
        )}
        contentClassName="pt-4"
      >
        <div className="max-w-lg mx-auto">
          <div className="bg-[#16213e] rounded-2xl p-6 border border-[#2a2a4a] mb-6">
            <p className="text-lg font-semibold text-white">Olá {accountDisplayName}, Bem-vindo!</p>
            <p className="text-sm text-gray-400 mt-1">{user?.email}</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {actions.map((action) => {
              const Icon = action.icon;
              const state = action.to === 'Settings' ? { returnTo: location.pathname } : undefined;
              return (
                <Tooltip key={action.key}>
                  <TooltipTrigger asChild>
                    <Link
                      to={createPageUrl(action.to)}
                      state={state}
                      className="bg-[#16213e] border border-[#2a2a4a] rounded-2xl p-4 hover:bg-[#1d274b] transition-colors"
                    >
                      <Icon className="w-7 h-7 text-[#0f9b8e] mb-3" />
                      <p className="font-semibold">{action.label}</p>
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-[220px] bg-[#0d0d1a] border border-[#3a3a5a] text-white shadow-lg text-center">
                    {action.tooltip}
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </div>
      </PageShell>
    </TooltipProvider>
  );
}
