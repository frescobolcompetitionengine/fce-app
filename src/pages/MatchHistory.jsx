import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Calendar, ChevronRight, Trash2, CheckSquare, Square, Download, FileText, Wand2 } from 'lucide-react';
import { Navigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import MatchReport from '@/components/MatchReport';
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/lib/AuthContext';
import { formatMatchDateTime, getMatchStatus, getMatchTitle, getMatchVisibility } from '@/lib/matchPresentation';
import { createSpeedScoreCalculator, resolveScoringConfiguration } from '@/lib/scoring';
import { exportMatchCSV as exportMatchCSVHelper, exportMatchesCSV as exportMatchesCSVHelper, exportMatchesPDF as exportMatchesPDFHelper } from '@/lib/matchHistoryTools';
import { filterMatchHistoryByOwner } from '@/lib/matchHistoryView';
import { deleteSelectedMatchHistory, deleteSingleMatchHistory, openOrCreateDemoMatch, seedDemoMatchIfMissing } from '@/lib/matchHistoryActions';
import PageShell from '@/components/PageShell';
import { createMatchHistory, deleteMatchHistory, deleteManyMatchHistory, listMatchHistory } from '@/services/matchHistoryRepository';

function exportCSV(match, t) {
  const csv = exportMatchCSVHelper(match, t);
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `report-${match.left_name}-${match.right_name}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportMultipleCSV(matches, t, language) {
  const csv = exportMatchesCSVHelper(matches, t, language);
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'match-history.csv';
  a.click();
  URL.revokeObjectURL(url);
}

async function exportMultiplePDF(matches, t, language) {
  const doc = exportMatchesPDFHelper(matches, t, language);
  doc.save('match-history.pdf');
}

export default function MatchHistory() {
  const [selected, setSelected] = useState(null);
  const [showReport, setShowReport] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [deleting, setDeleting] = useState(false);
  const [creatingDemo, setCreatingDemo] = useState(false);
  const demoSeededRef = useRef(false);
  const queryClient = useQueryClient();
  const { t, language } = useI18n();
  const { user, users, isAdmin, isSpectator } = useAuth();
  const [selectedOwner, setSelectedOwner] = useState('mine');

  const { data: allMatches = [], isLoading } = useQuery({
    queryKey: ['matchHistory'],
    enabled: !isSpectator,
    queryFn: () => listMatchHistory('-played_at', 100),
  });

  const matches = filterMatchHistoryByOwner(allMatches, { isAdmin, selectedOwner, userId: user?.id });

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === matches.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(matches.map((m) => m.id)));
  };

  const deleteMatch = (id) => deleteSingleMatchHistory({ id, deleteMatchHistory, queryClient });

  const deleteSelected = () => deleteSelectedMatchHistory({
    selectedIds,
    deleteManyMatchHistory,
    queryClient,
    setSelectedIds,
    setSelectionMode,
    setDeleting,
  });

  const createDemoReport = () => openOrCreateDemoMatch({
    allMatches,
    user,
    t,
    createMatchHistory,
    queryClient,
    setSelected,
    setShowReport,
    setCreatingDemo,
  });

  useEffect(() => {
    if (isLoading || isSpectator || !user?.id || demoSeededRef.current) return;

    (async () => {
      try {
        await seedDemoMatchIfMissing({
          allMatches,
          user,
          t,
          createMatchHistory,
          queryClient,
          setSelected,
          setShowReport,
          demoSeededRef,
        });
      } catch (error) {
        console.error('Failed to seed demo match:', error);
      }
    })();
  }, [allMatches, createMatchHistory, isLoading, isSpectator, queryClient, t, user, setSelected, setShowReport]);

  if (isLoading) {
    return <div className="min-h-[100dvh] bg-gradient-to-b from-[#1a1a2e] to-[#0d0d1a] flex items-center justify-center"><div className="animate-spin w-8 h-8 border-4 border-[#0f9b8e] border-t-transparent rounded-full" /></div>;
  }

  if (isSpectator) {
    return <Navigate to={createPageUrl('SpectatorHub')} replace />;
  }

  const dt = selected ? formatMatchDateTime(selected.played_at, language) : null;
  const selectedScoringConfig = resolveScoringConfiguration(selected?.scoring_mode || 'option_1', selected?.min_scoring_speed ?? 50);

  return (
    <PageShell
      title={t('historyTitle')}
      backTo={createPageUrl('SpeedMeter')}
      headerRight={!selected ? (
        <button onClick={() => { setSelectionMode((prev) => !prev); setSelectedIds(new Set()); }} className={`p-2 rounded-full transition-colors ${selectionMode ? 'bg-[#0f9b8e]' : 'bg-[#2a2a4a] hover:bg-[#3a3a5a]'}`}>
          <CheckSquare className="w-5 h-5 text-gray-200" />
        </button>
      ) : (
        <div className="w-9" />
      )}
      contentClassName="pt-4"
    >

      {selectionMode && !selected && (
        <div className="bg-[#16213e] border-b border-[#2a2a4a] px-4 py-3 flex items-center gap-3 flex-wrap">
          <button onClick={selectAll} className="flex items-center gap-2 text-sm text-gray-300 hover:text-white transition-colors">
            {selectedIds.size === matches.length && matches.length > 0 ? <CheckSquare className="w-4 h-4 text-[#0f9b8e]" /> : <Square className="w-4 h-4" />}
            {selectedIds.size === matches.length && matches.length > 0 ? t('unselectAll') : t('selectAll')}
          </button>
          <span className="text-gray-500 text-sm">{t('selectedCount', { count: selectedIds.size })}</span>
          <div className="flex gap-2 ml-auto">
            <button onClick={() => exportMultipleCSV(matches.filter((m) => selectedIds.has(m.id)), t, language)} disabled={selectedIds.size === 0} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#2a2a4a] hover:bg-[#3a3a5a] text-xs font-bold text-gray-200 transition-colors disabled:opacity-40"><FileText className="w-3.5 h-3.5" /> CSV</button>
            <button onClick={() => exportMultiplePDF(matches.filter((m) => selectedIds.has(m.id)), t, language)} disabled={selectedIds.size === 0} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#0f9b8e] hover:bg-[#0d847a] text-xs font-bold text-white transition-colors disabled:opacity-40"><Download className="w-3.5 h-3.5" /> PDF</button>
            <button onClick={deleteSelected} disabled={selectedIds.size === 0 || deleting} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-800/60 hover:bg-red-700 text-xs font-bold text-red-200 transition-colors disabled:opacity-40"><Trash2 className="w-3.5 h-3.5" /> {deleting ? t('deleting') : t('delete')}</button>
          </div>
        </div>
      )}

      {!selected && (
        <div className="space-y-3 max-w-lg mx-auto">
          {isAdmin && (
            <div className="bg-[#16213e] border border-[#2a2a4a] rounded-xl p-3">
              <label className="text-xs text-gray-400">Filtro de usuÃ¡rio.</label>
              <select value={selectedOwner} onChange={(e) => setSelectedOwner(e.target.value)} className="mt-1 w-full h-10 rounded-lg bg-[#0d0d1a] border border-[#3a3a5a] px-2 text-sm">
                <option value="mine">Meus jogos.</option>
                <option value="all">Todos os jogos.</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.first_name} {u.last_name} ({u.email})
                  </option>
                ))}
              </select>
            </div>
          )}
          <button
            onClick={createDemoReport}
            disabled={creatingDemo}
            className="w-full flex items-center justify-center gap-2 rounded-2xl border border-[#0f9b8e]/40 bg-[#0f9b8e]/10 px-4 py-3 text-sm font-semibold text-[#b8f2ea] transition-colors hover:bg-[#0f9b8e]/20 disabled:opacity-60"
          >
            <Wand2 className={`w-4 h-4 ${creatingDemo ? 'animate-pulse' : ''}`} />
            {creatingDemo ? t('creatingDemoMatch') : t('insertDemoMatch')}
          </button>
          {matches.length === 0 && <div className="text-center text-gray-500 mt-16"><Calendar className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>{t('noMatchesYet')}</p></div>}
          {matches.map((match) => {
            const { date, time } = formatMatchDateTime(match.played_at, language);
            const isChecked = selectedIds.has(match.id);
            return (
              <div key={match.id} className={`w-full bg-[#16213e] border rounded-2xl p-4 flex items-center gap-3 transition-colors ${isChecked ? 'border-[#0f9b8e]' : 'border-[#2a2a4a]'}`}>
                {selectionMode && <button onClick={() => toggleSelect(match.id)} className="flex-shrink-0">{isChecked ? <CheckSquare className="w-5 h-5 text-[#0f9b8e]" /> : <Square className="w-5 h-5 text-gray-500" />}</button>}
                <button onClick={() => !selectionMode && setSelected(match)} className="flex-1 flex items-center justify-between text-left">
                  <div>
                    <p className="text-gray-400 text-sm font-mono">{date} - {time}</p>
                    <p className="text-white font-bold text-base mt-0.5">{getMatchTitle(match)}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${getMatchStatus(match) === 'live' ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300' : 'border-slate-500/30 bg-slate-500/15 text-slate-300'}`}>
                        {getMatchStatus(match) === 'live' ? t('liveStatus') : t('finishedStatus')}
                      </span>
                      <span className="rounded-full border border-[#2a2a4a] bg-[#0d0d1a] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-gray-300">
                        {getMatchVisibility(match) === 'public' ? t('publicGame') : t('privateGame')}
                      </span>
                    </div>
                    <p className="text-[#0f9b8e] text-sm font-semibold mt-0.5">{match.total_score?.toLocaleString()} {t('pts')}</p>
                  </div>
                  {!selectionMode && <ChevronRight className="w-5 h-5 text-gray-500 flex-shrink-0" />}
                </button>
                {!selectionMode && <button onClick={() => deleteMatch(match.id)} className="flex-shrink-0 p-2 rounded-full bg-red-900/30 hover:bg-red-800/60 transition-colors"><Trash2 className="w-4 h-4 text-red-400" /></button>}
              </div>
            );
          })}
        </div>
      )}

      {selected && !showReport && (
        <div className="max-w-lg mx-auto">
          <button onClick={() => setSelected(null)} className="flex items-center gap-2 text-gray-400 hover:text-white text-sm mb-4 transition-colors"><ArrowLeft className="w-4 h-4" /> {t('back')}</button>
          <div className="bg-[#16213e] border border-[#2a2a4a] rounded-2xl p-5 mb-4 text-center">
            <p className="text-gray-400 text-sm font-mono mb-1">{dt.date} - {dt.time}</p>
            <p className="text-white font-bold text-lg">{getMatchTitle(selected)}</p>
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${getMatchStatus(selected) === 'live' ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300' : 'border-slate-500/30 bg-slate-500/15 text-slate-300'}`}>
                {getMatchStatus(selected) === 'live' ? t('liveStatus') : t('finishedStatus')}
              </span>
              <span className="rounded-full border border-[#2a2a4a] bg-[#0d0d1a] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-gray-300">
                {getMatchVisibility(selected) === 'public' ? t('publicGame') : t('privateGame')}
              </span>
            </div>
            <p className="text-4xl font-bold text-white mt-2">{selected.total_score?.toLocaleString()}</p>
            <p className="text-[#0f9b8e] text-sm">{t('totalPoints')}</p>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-[#16213e] border border-[#2a2a4a] rounded-xl p-3 text-center"><p className="text-white font-bold text-xl">{selected.ball_drops ?? 0}</p><p className="text-gray-500 text-xs">{t('drops')}</p></div>
            <div className="bg-[#16213e] border border-[#2a2a4a] rounded-xl p-3 text-center"><p className="text-white font-bold text-xl">{(selected.left_hits?.length ?? 0) + (selected.right_hits?.length ?? 0)}</p><p className="text-gray-500 text-xs">{t('hits')}</p></div>
            <div className="bg-[#16213e] border border-[#2a2a4a] rounded-xl p-3 text-center"><p className="text-white font-bold text-xl">{selected.distance_meters ?? '-'}m</p><p className="text-gray-500 text-xs">{t('distance')}</p></div>
          </div>

          <div className="flex gap-2 mb-2">
            <button onClick={() => exportCSV(selected, t)} className="flex-1 bg-[#2a2a4a] hover:bg-[#3a3a5a] text-white font-bold py-3 rounded-full transition-colors">CSV</button>
            <button onClick={() => setShowReport(true)} className="flex-1 bg-[#0f9b8e] hover:bg-[#0d847a] text-white font-bold py-3 rounded-full transition-colors">{t('fullReport')}</button>
          </div>
        </div>
      )}

      {selected && showReport && (
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
          duoName={getMatchTitle(selected)}
          onClose={() => setShowReport(false)}
        />
      )}
    </PageShell>
  );
}


