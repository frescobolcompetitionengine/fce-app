import React from 'react';
import { ExternalLink, Flame, Play, RotateCcw, Undo2, ChevronLeft, ChevronRight, Settings as SettingsIcon, House } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { useI18n } from '@/lib/i18n';
import { emitTournamentControl } from '@/lib/tournamentControlBus';

function ControlButton({ label, icon: Icon = null, onClick, tone = 'neutral' }) {
  const tones = {
    neutral: 'bg-[#16213e] hover:bg-[#1d274b] border-[#2a2a4a]',
    action: 'bg-[#0f9b8e] hover:bg-[#0d847a] border-transparent',
    warning: 'bg-amber-700/80 hover:bg-amber-700 border-transparent',
    danger: 'bg-red-800/75 hover:bg-red-700 border-transparent',
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex w-full items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold text-white transition-colors ${tones[tone] || tones.neutral}`}
    >
      {Icon ? <Icon className="h-4 w-4" /> : null}
      <span>{label}</span>
    </button>
  );
}

export default function TournamentControlPanel() {
  const { t } = useI18n();

  const send = (command, payload = {}) => emitTournamentControl(command, payload);

  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden rounded-none border-l border-white/8 bg-[#0d0d1a] text-white">
      <div className="flex items-center justify-between gap-3 border-b border-white/8 px-4 py-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-gray-500">{t('tournamentMode')}</p>
          <h2 className="truncate text-xl font-bold">{t('tournamentControlPanel')}</h2>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to={createPageUrl('Settings')}
            state={{ returnTo: createPageUrl('TournamentRoom') }}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 transition-colors hover:bg-white/10"
            title={t('settings')}
            aria-label={t('settings')}
          >
            <SettingsIcon className="h-4 w-4 text-gray-200" />
          </Link>
          <Link
            to="/"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 transition-colors hover:bg-white/10"
            title={t('mainMenu')}
            aria-label={t('mainMenu')}
          >
            <House className="h-4 w-4 text-gray-200" />
          </Link>
          <Link
            to={createPageUrl('TournamentView')}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 transition-colors hover:bg-white/10"
            title={t('openTournamentView')}
            aria-label={t('openTournamentView')}
          >
            <ExternalLink className="h-4 w-4 text-gray-200" />
          </Link>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="space-y-4">
          <div className="rounded-2xl border border-white/8 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-gray-400">{t('controlCommands')}</p>
            <p className="mt-2 text-sm leading-relaxed text-gray-300">{t('controlCommandsHint')}</p>
          </div>

          <div className="grid gap-3">
            <ControlButton label={t('startGame')} icon={Play} tone="action" onClick={() => send('toggle_timer')} />
            <ControlButton label={t('warmup')} icon={Flame} tone="neutral" onClick={() => send('toggle_warmup')} />
            <ControlButton label={t('finishWarmup')} icon={Flame} tone="warning" onClick={() => send('finish_warmup')} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <ControlButton label={t('left')} icon={ChevronLeft} tone="neutral" onClick={() => send('pass_left')} />
            <ControlButton label={t('right')} icon={ChevronRight} tone="neutral" onClick={() => send('pass_right')} />
          </div>

          <div className="grid gap-3">
            <ControlButton label={t('ballDrop')} tone="warning" onClick={() => send('ball_drop')} />
            <ControlButton label={t('undoDrop')} icon={Undo2} tone="neutral" onClick={() => send('undo_drop')} />
            <ControlButton label={t('resetMatch')} icon={RotateCcw} tone="danger" onClick={() => send('reset')} />
          </div>
        </div>
      </div>
    </aside>
  );
}
