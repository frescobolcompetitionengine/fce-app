import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowLeft, Gauge, History, Play, Settings, ShieldCheck } from 'lucide-react';
import { createPageUrl } from '@/utils';
import { useAuth } from '@/lib/AuthContext';
import { useI18n } from '@/lib/i18n';

function getNavItems(t, isAdmin, isTournament) {
  const items = [
    { to: 'GameSetup', label: t('createShort'), icon: Play },
    { to: 'SpeedMeter', label: t('measurement'), icon: Gauge },
    { to: 'MatchHistory', label: t('reports'), icon: History },
    { to: 'Settings', label: t('settings'), icon: Settings },
  ];

  if (isTournament) {
    items.push({ to: 'TournamentRoom', label: t('tournamentRoom'), icon: Play });
  }

  if (isAdmin) {
    items.push({ to: 'AdminDashboard', label: t('adminPanel'), icon: ShieldCheck });
  }

  return items;
}

export default function PageShell({
  title,
  backTo,
  headerRight = null,
  children,
  className = '',
  contentClassName = '',
  showDock = true,
}) {
  const location = useLocation();
  const { isAdmin, isTournament } = useAuth();
  const { t } = useI18n();
  const isNative = Boolean(globalThis.Capacitor?.isNativePlatform?.());
  const navItems = getNavItems(t, isAdmin, isTournament);
  const activePath = location.pathname.replace(/\/$/, '') || '/';

  return (
    <div className={`min-h-[100dvh] bg-gradient-to-b from-[#1a1a2e] to-[#0d0d1a] text-white ${className}`}>
      {!isNative && navItems.length > 0 && (
        <aside className="fixed left-0 top-0 z-40 hidden h-[100dvh] w-24 border-r border-white/8 bg-[#0d0d1a]/80 px-2 py-4 backdrop-blur-xl md:flex md:flex-col md:justify-between">
          <div className="space-y-2">
            <div className="flex items-center justify-center rounded-2xl border border-white/8 bg-white/5 px-2 py-3">
              <img
                src="/FCE_Logo.png"
                alt="FCE"
                className="max-h-14 w-auto object-contain"
              />
            </div>
            {navItems.map((item) => {
              const Icon = item.icon;
              const to = createPageUrl(item.to);
              const isActive = activePath === to;

              return (
                <Link
                  key={item.to}
                  to={to}
                  className={`flex flex-col items-center gap-1 rounded-2xl px-2 py-3 text-[11px] font-semibold transition-colors ${
                    isActive
                      ? 'bg-[#0f9b8e]/20 text-[#6ee7df]'
                      : 'text-gray-400 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <Icon className={`h-5 w-5 ${isActive ? 'text-[#0f9b8e]' : ''}`} />
                  <span className="text-center leading-tight">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </aside>
      )}

      <div className={`mx-auto flex min-h-[100dvh] w-full max-w-6xl flex-col ${!isNative && navItems.length > 0 ? 'md:pl-24' : ''}`}>
        <header className="sticky top-0 z-30 border-b border-white/8 bg-[#0d0d1a]/75 backdrop-blur-xl pt-[calc(0.75rem+env(safe-area-inset-top))]">
          <div className="flex items-center justify-between gap-3 px-4 pb-3 md:px-6">
            <div className="flex w-10 items-center justify-start">
              {backTo ? (
                <Link
                  to={backTo}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#2a2a4a] transition-colors hover:bg-[#3a3a5a]"
                  aria-label={t('back')}
                >
                  <ArrowLeft className="h-5 w-5 text-gray-200" />
                </Link>
              ) : (
                <span className="h-10 w-10" />
              )}
            </div>

            <div className="min-w-0 flex-1 text-center">
              <h1 className="truncate text-lg font-bold md:text-2xl">{title}</h1>
            </div>

            <div className="flex min-w-[2.5rem] items-center justify-end gap-2">{headerRight}</div>
          </div>
        </header>

        <main className={`flex-1 px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-4 md:px-6 md:pb-8 ${contentClassName}`}>
          {children}
        </main>
      </div>

      {showDock && navItems.length > 0 && (
        <nav
          className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#0d0d1a]/90 px-3 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl md:hidden"
          aria-label="Navegação principal"
        >
          <div
            className="mx-auto grid max-w-2xl gap-2"
            style={{ gridTemplateColumns: `repeat(${navItems.length}, minmax(0, 1fr))` }}
          >
            {navItems.map((item) => {
              const Icon = item.icon;
              const to = createPageUrl(item.to);
              const isActive = activePath === to;

              return (
                <Link
                  key={item.to}
                  to={to}
                  className={`flex min-w-0 flex-col items-center justify-center rounded-2xl px-2 py-2 text-[11px] font-semibold transition-colors ${
                    isActive
                      ? 'bg-[#0f9b8e]/20 text-[#6ee7df]'
                      : 'text-gray-400 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <Icon className={`mb-1 h-4 w-4 ${isActive ? 'text-[#0f9b8e]' : ''}`} />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}
