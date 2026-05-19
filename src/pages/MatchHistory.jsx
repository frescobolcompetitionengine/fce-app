import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Calendar, ChevronRight, Trash2, CheckSquare, Square, Download, FileText, Wand2 } from 'lucide-react';
import { Navigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import MatchReport from '@/components/MatchReport';
import jsPDF from 'jspdf';
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/lib/AuthContext';
import { buildAthleteScoreBreakdown, calculateFrescobolRule2Score, getScoringModeDefaults } from '@/lib/scoring';
import PageShell from '@/components/PageShell';
import { createMatchHistory, deleteMatchHistory, deleteManyMatchHistory, listMatchHistory } from '@/services/matchHistoryRepository';

function formatDateTime(iso, language) {
  if (!iso) return { date: '-', time: '-' };
  const d = new Date(iso);
  const date = d.toLocaleDateString(language);
  const time = d.toLocaleTimeString(language, { hour: '2-digit', minute: '2-digit' });
  return { date, time };
}

function getMatchTitle(match) {
  return match?.duo_name || `${match?.left_name || '-'} - ${match?.right_name || '-'}`;
}

function getMatchStatus(match) {
  return match?.game_status === 'live' ? 'live' : 'finished';
}

function getMatchVisibility(match) {
  return match?.visibility === 'public' ? 'public' : 'private';
}

function makeCalculateScore(match) {
  const scoringMode = match?.scoring_mode || 'option_1';
  const minScoringSpeed = match?.min_scoring_speed ?? 50;
  return (speedKmh) => {
    if (speedKmh <= 0 || speedKmh < minScoringSpeed) return 0;
    if (scoringMode === 'option_2') return Math.floor((speedKmh * (50 + speedKmh)) / 100);
    return Math.floor((speedKmh * speedKmh) / 50);
  };
}

function getTop150(hits) {
  return [...hits].sort((a, b) => a.speed - b.speed).slice(-150);
}

function fmt(t) {
  const mins = Math.floor(t / 60);
  const secs = t % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function buildDemoHits(startMs, speeds, spacingMs = 160) {
  return speeds.map((speed, index) => {
    const timestampMs = startMs + index * spacingMs;
    return {
      speed,
      timestampMs,
      elapsedMs: timestampMs - startMs,
      t: Number(((timestampMs - startMs) / 1000).toFixed(3)),
    };
  });
}

function buildDemoMatch(user, t) {
  const now = Date.now();
  const leftSpeeds = [52, 58, 67, 80, 96, 115, 138, 165, 198, 238, 120, 150];
  const rightSpeeds = [54, 60, 72, 86, 103, 124, 149, 178, 212, 251, 130, 158];
  const leftHits = [
    ...buildDemoHits(now, leftSpeeds.slice(0, 10), 150),
    ...buildDemoHits(now + 3200, leftSpeeds.slice(10), 180),
  ];
  const rightHits = [
    ...buildDemoHits(now + 800, rightSpeeds.slice(0, 10), 150),
    ...buildDemoHits(now + 4100, rightSpeeds.slice(10), 180),
  ];
  const calculateScore = (speedKmh) => calculateFrescobolRule2Score(speedKmh);
  const leftBreakdown = buildAthleteScoreBreakdown(leftHits, calculateScore, { continuityEnabled: true, powerEnabled: true });
  const rightBreakdown = buildAthleteScoreBreakdown(rightHits, calculateScore, { continuityEnabled: true, powerEnabled: true });
  const ballDropEvents = [
    { drop_number: 1, elapsed_seconds: 19, responsible_side: 'left', responsible_name: t('leftPlayer') },
    { drop_number: 2, elapsed_seconds: 74, responsible_side: 'right', responsible_name: t('rightPlayer') },
  ];

  return {
    demo_key: `fce-bonus-demo-v1-${user?.id || 'guest'}`,
    is_demo: true,
    played_at: new Date().toISOString(),
    started_at: new Date(now - 90_000).toISOString(),
    game_status: 'finished',
    match_ended: true,
    visibility: 'private',
    duo_name: 'Demo de Bônus',
    left_name: t('leftPlayer'),
    right_name: t('rightPlayer'),
    left_photo: '',
    right_photo: '',
    left_hits: leftHits,
    right_hits: rightHits,
    ball_drops: ballDropEvents.length,
    ball_drop_events: ballDropEvents,
    free_ball_drops: 5,
    total_score: leftBreakdown.total + rightBreakdown.total,
    scoring_mode: 'option_2',
    min_scoring_speed: 50,
    balance_enabled: true,
    continuity_enabled: true,
    power_enabled: true,
    distance_meters: 10,
    match_duration_minutes: 5,
    warmup_duration_minutes: 5,
    owner_user_id: user?.id,
    owner_email: user?.email,
  };
}

function exportCSV(match, t) {
  const calc = makeCalculateScore(match);
  const leftHits = match.left_hits || [];
  const rightHits = match.right_hits || [];
  const ballDropEvents = Array.isArray(match.ball_drop_events) ? match.ball_drop_events : [];
  const freeBallDrops = match.free_ball_drops ?? 5;
  const leftTop = new Set(getTop150(leftHits).map((h) => `${h.speed.toFixed(4)}_${h.t}`));
  const rightTop = new Set(getTop150(rightHits).map((h) => `${h.speed.toFixed(4)}_${h.t}`));
  const rows = [[t('player'), t('speedKmh'), t('timeMmSs'), t('points'), t('top150Ranking')]];

  [...leftHits].sort((a, b) => b.speed - a.speed).forEach((hit) => {
    const key = `${hit.speed.toFixed(4)}_${hit.t}`;
    rows.push([match.left_name, hit.speed.toFixed(2), fmt(hit.t), calc(hit.speed), leftTop.has(key) ? t('yes') : t('no')]);
  });
  [...rightHits].sort((a, b) => b.speed - a.speed).forEach((hit) => {
    const key = `${hit.speed.toFixed(4)}_${hit.t}`;
    rows.push([match.right_name, hit.speed.toFixed(2), fmt(hit.t), calc(hit.speed), rightTop.has(key) ? t('yes') : t('no')]);
  });
  rows.push([]);
  rows.push([t('totalScore'), match.total_score]);
  rows.push([t('drops'), match.ball_drops ?? 0]);
  const penaltyDrops = Math.max(0, (match.ball_drops ?? 0) - freeBallDrops);
  const penalty = penaltyDrops > 0 ? `${(100 - Math.pow(0.97, penaltyDrops) * 100).toFixed(1)}%` : '0%';
  rows.push([t('dropDiscount'), penalty]);
  rows.push([]);
  rows.push([t('ballDropList'), t('timeMmSs'), t('responsible')]);
  ballDropEvents.forEach((drop, index) => {
    const responsible = drop?.responsible_name || (drop?.responsible_side === 'left' ? match.left_name : drop?.responsible_side === 'right' ? match.right_name : t('unknown'));
    rows.push([`#${Number.isFinite(drop?.drop_number) ? drop.drop_number : index + 1}`, fmt(Number.isFinite(drop?.elapsed_seconds) ? drop.elapsed_seconds : 0), responsible || t('unknown')]);
  });

  const csv = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `report-${match.left_name}-${match.right_name}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportMultipleCSV(matches, t, language) {
  const rows = [[t('date'), t('hour'), t('leftPlayerShort'), t('rightPlayerShort'), t('totalScoreLabel'), t('drops'), t('hits')]];
  matches.forEach((match) => {
    const { date, time } = formatDateTime(match.played_at, language);
    rows.push([date, time, match.left_name, match.right_name, match.total_score, match.ball_drops ?? 0, (match.left_hits?.length ?? 0) + (match.right_hits?.length ?? 0)]);
  });
  const csv = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'match-history.csv';
  a.click();
  URL.revokeObjectURL(url);
}

async function exportMultiplePDF(matches, t, language) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210;
  const margin = 14;
  /** @type {[number, number, number]} */
  const teal = [15, 155, 142];
  /** @type {[number, number, number]} */
  const dark = [13, 13, 26];
  doc.setFillColor(...dark);
  doc.rect(0, 0, W, 297, 'F');
  doc.setFillColor(...teal);
  doc.rect(0, 0, W, 18, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text(t('historyTitle'), W / 2, 12, { align: 'center' });

  let y = 28;
  doc.setFillColor(...teal);
  doc.rect(margin, y, W - margin * 2, 7, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.text(t('date'), margin + 2, y + 5);
  doc.text(t('duo'), margin + 28, y + 5);
  doc.text(t('points'), margin + 100, y + 5);
  doc.text(t('drops'), margin + 130, y + 5);
  doc.text(t('hits'), margin + 155, y + 5);
  y += 8;

  matches.forEach((match, i) => {
    if (y > 280) {
      doc.addPage();
      doc.setFillColor(...dark);
      doc.rect(0, 0, W, 297, 'F');
      y = 14;
    }
    const { date, time } = formatDateTime(match.played_at, language);
    doc.setFillColor(i % 2 === 0 ? 22 : 30, i % 2 === 0 ? 33 : 30, i % 2 === 0 ? 62 : 40);
    doc.rect(margin, y, W - margin * 2, 6, 'F');
    doc.setTextColor(180, 180, 200);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text(`${date} ${time}`, margin + 2, y + 4);
    doc.text(`${match.left_name} & ${match.right_name}`, margin + 28, y + 4);
    doc.setTextColor(...teal);
    doc.text(`${match.total_score?.toLocaleString()}`, margin + 100, y + 4);
    doc.setTextColor(180, 180, 200);
    doc.text(`${match.ball_drops ?? 0}`, margin + 130, y + 4);
    doc.text(`${(match.left_hits?.length ?? 0) + (match.right_hits?.length ?? 0)}`, margin + 155, y + 4);
    y += 6;
  });
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

  const matches = allMatches.filter((m) => {
    if (!isAdmin) return m.owner_user_id === user?.id;
    if (selectedOwner === 'all') return true;
    if (selectedOwner === 'mine') return m.owner_user_id === user?.id;
    return m.owner_user_id === selectedOwner;
  });

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

  const deleteMatch = async (id) => {
    await deleteMatchHistory(id);
    queryClient.invalidateQueries({ queryKey: ['matchHistory'] });
  };

  const deleteSelected = async () => {
    setDeleting(true);
    await deleteManyMatchHistory([...selectedIds]);
    setSelectedIds(new Set());
    setSelectionMode(false);
    queryClient.invalidateQueries({ queryKey: ['matchHistory'] });
    setDeleting(false);
  };

  const createDemoReport = async () => {
    setCreatingDemo(true);
    try {
      const existingDemo = allMatches.find((match) => match?.owner_user_id === user?.id && String(match?.demo_key || '').startsWith('fce-bonus-demo-v1-'));
      if (existingDemo) {
        setSelected(existingDemo);
        setShowReport(true);
        return;
      }

      const demoMatch = buildDemoMatch(user, t);
      const created = await createMatchHistory(demoMatch);
      await queryClient.invalidateQueries({ queryKey: ['matchHistory'] });
      setSelected(created);
      setShowReport(true);
    } finally {
      setCreatingDemo(false);
    }
  };

  useEffect(() => {
    if (isLoading || isSpectator || !user?.id || demoSeededRef.current) return;

    const existingDemo = allMatches.find((match) => match?.owner_user_id === user?.id && String(match?.demo_key || '').startsWith('fce-bonus-demo-v1-'));
    if (existingDemo) {
      demoSeededRef.current = true;
      setSelected(existingDemo);
      setShowReport(true);
      return;
    }

    demoSeededRef.current = true;
    (async () => {
      try {
        const demoMatch = buildDemoMatch(user, t);
        const created = await createMatchHistory(demoMatch);
        await queryClient.invalidateQueries({ queryKey: ['matchHistory'] });
        setSelected(created);
        setShowReport(true);
      } catch (error) {
        console.error('Failed to seed demo match:', error);
      }
    })();
  }, [allMatches, isLoading, isSpectator, queryClient, t, user?.id]);

  if (isLoading) {
    return <div className="min-h-[100dvh] bg-gradient-to-b from-[#1a1a2e] to-[#0d0d1a] flex items-center justify-center"><div className="animate-spin w-8 h-8 border-4 border-[#0f9b8e] border-t-transparent rounded-full" /></div>;
  }

  if (isSpectator) {
    return <Navigate to={createPageUrl('SpectatorHub')} replace />;
  }

  const dt = selected ? formatDateTime(selected.played_at, language) : null;
  const selectedScoringModeDefaults = selected ? getScoringModeDefaults(selected.scoring_mode || 'option_1') : getScoringModeDefaults('option_1');

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
              <label className="text-xs text-gray-400">Filtro de usuário.</label>
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
            const { date, time } = formatDateTime(match.played_at, language);
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
          calculateScore={makeCalculateScore(selected)}
          continuityEnabled={selected.continuity_enabled ?? selectedScoringModeDefaults.continuity_enabled}
          powerEnabled={selected.power_enabled ?? selectedScoringModeDefaults.power_enabled}
          matchStatus={getMatchStatus(selected)}
          visibility={getMatchVisibility(selected)}
          duoName={getMatchTitle(selected)}
          onClose={() => setShowReport(false)}
        />
      )}
    </PageShell>
  );
}

