import React, { useEffect, useMemo, useRef, useState } from 'react';
import jsPDF from 'jspdf';
import { AlertTriangle, ArrowUpDown, BarChart3, Download, FileText, Trash2, Upload, X } from 'lucide-react';
import { Navigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import PageShell from '@/components/PageShell';
import { useAuth } from '@/lib/AuthContext';
import { useI18n } from '@/lib/i18n';
import {
  analyzeFrescogoReport,
  buildFrescogoCombinedAnalysis,
  getFrescogoMatchKey,
} from '@/lib/frescogoAnalysis';
import { fetchWithApiFallback } from '@/services/apiClient';
import {
  createAnalysisReport,
  deleteAnalysisReport,
  getAnalysisReport,
  listAnalysisReports,
} from '@/services/analysisReportsRepository';

function formatValue(value) {
  if (value === '' || value == null) return '-';
  return String(value);
}

function formatDecimal(value, digits = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '-';
  return number.toFixed(digits);
}

function getVerdictLabel(verdict, t) {
  switch (verdict) {
    case 'maxima':
      return t('analysisVerdictMaxima');
    case 'continuity':
      return t('analysisVerdictContinuity');
    case 'power':
      return t('analysisVerdictPower');
    case 'mixed':
      return t('analysisVerdictMixed');
    default:
      return t('analysisVerdictUnknown');
  }
}

function formatScoringBall(ball, t) {
  if (!ball) return '-';
  const sequence = Number.isFinite(ball.sequence) ? `#${String(ball.sequence).padStart(2, '0')}` : '-';
  const points = Number.isFinite(ball.primaryTotalScore) ? `${ball.primaryTotalScore} ${t('points')}` : '-';
  const bonus = Number.isFinite(ball.primaryBonusScore) && ball.primaryBonusScore > 0 ? `+${ball.primaryBonusScore}` : '-';
  return `${sequence} | ${ball.elapsedLabel || '-'} | ${formatTimelineSpeed(ball)} | ${points} | ${bonus}`;
}

function BallSummaryLine({ label, ball, tone = 'neutral', t }) {
  if (!ball) {
    return (
      <div className="min-h-[3.5rem] rounded-2xl border border-white/10 bg-white/5 px-2 py-1.5">
        <div className="flex h-full flex-col justify-between gap-1">
          <span className="text-[10px] uppercase tracking-[0.18em] text-gray-500">{label}</span>
          <span className="text-sm text-gray-500">-</span>
        </div>
      </div>
    );
  }

  const toneClass = tone === 'positive'
    ? 'border-emerald-500/25 bg-emerald-500/10'
    : tone === 'warning'
      ? 'border-amber-500/25 bg-amber-500/10'
      : 'border-white/10 bg-white/5';
  const points = Number.isFinite(ball.primaryTotalScore) ? `${ball.primaryTotalScore} ${t('points')}` : '-';
  const bonus = Number.isFinite(ball.primaryBonusScore) && ball.primaryBonusScore > 0
    ? `+${ball.primaryBonusScore}`
    : '-';

  return (
    <div className={`min-h-[3.5rem] rounded-2xl border px-2 py-1.5 ${toneClass}`}>
      <div className="flex h-full flex-col justify-between gap-1">
        <div className="flex items-center justify-between gap-3">
          <span className="truncate text-[10px] uppercase tracking-[0.18em] text-gray-500">{label}</span>
          <span className="font-mono text-[10px] text-gray-200">{formatTimelineSpeed(ball)}</span>
        </div>
        <div className="flex items-end justify-between gap-2">
          <span className="truncate text-[10px] font-mono text-gray-200">
            {ball.sequence != null ? `#${String(ball.sequence).padStart(2, '0')}` : '-'} · {ball.elapsedLabel || '-'}
          </span>
          <div className="flex items-center justify-end gap-1.5">
            <span className="rounded-full border border-white/10 bg-black/20 px-2 py-0.5 text-[10px] font-semibold text-white">{points}</span>
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black ${Number(ball.primaryBonusScore) > 0 ? 'border-amber-500/30 bg-amber-500/15 text-amber-200' : 'border-white/10 bg-white/5 text-gray-500'}`}>
              {bonus}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryMetricTile({ label, value, tone = 'neutral' }) {
  const toneClass = tone === 'positive'
    ? 'border-emerald-500/20 bg-emerald-500/8'
    : tone === 'warning'
      ? 'border-amber-500/20 bg-amber-500/8'
      : 'border-white/10 bg-white/5';

  return (
    <div className={`min-h-[3.5rem] rounded-2xl border px-2 py-1.5 ${toneClass}`}>
      <div className="flex h-full flex-col items-center justify-between gap-1 text-center">
        <span className="block text-[10px] uppercase tracking-[0.18em] text-gray-500">{label}</span>
        <span className="text-sm font-semibold leading-tight text-white">{value}</span>
      </div>
    </div>
  );
}

function formatBonusValue(value) {
  const bonus = Number(value);
  if (!Number.isFinite(bonus) || bonus <= 0) return '-';
  return `+${bonus}`;
}

function formatTimelineSpeed(hit = {}) {
  const speed = Number(hit?.speed);
  if (speed === 0) return 'Queda';
  if (!Number.isFinite(speed)) return '-';
  return `${formatValue(speed)} km/h`;
}

function isUnknownLabel(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return !normalized || normalized === 'desconhecido' || normalized === 'unknown' || normalized === '-';
}

function resolveHitSide(hit = {}) {
  if (!hit) return 'unknown';
  if (hit.side === 'left' || hit.side === 'right') return hit.side;
  if (hit.direction === '->') return 'left';
  if (hit.direction === '<-') return 'right';
  return 'unknown';
}

function resolveDropPlayerLabel(drop = {}, t) {
  if (!isUnknownLabel(drop.responsiblePlayer)) return drop.responsiblePlayer;
  if (drop.responsibleSide === 'left') return t('analysisSideA');
  if (drop.responsibleSide === 'right') return t('analysisSideB');
  return t('unknown');
}

function resolveTimelinePlayerLabel(hit = {}, leftLabel = '-', rightLabel = '-') {
  if (!isUnknownLabel(hit.playerName)) return hit.playerName;
  const side = resolveHitSide(hit);
  if (side === 'left') return leftLabel || '-';
  if (side === 'right') return rightLabel || '-';
  return leftLabel || rightLabel || '-';
}

function resolveRallyDropPlayerLabel(rally = {}, report = null, t) {
  const drop = rally.dropEvent || {};
  const hasResolvedDrop = !isUnknownLabel(drop.responsiblePlayer)
    || drop.responsibleSide === 'left'
    || drop.responsibleSide === 'right';
  if (hasResolvedDrop) {
    return resolveDropPlayerLabel(drop, t);
  }

  const hits = Array.isArray(rally.hits) ? rally.hits : [];
  const lastHit = [...hits].reverse().find((hit) => resolveHitSide(hit) !== 'unknown') || null;
  if (lastHit) {
    const side = resolveHitSide(lastHit);
    if (side === 'left') return report?.displayLeftName || report?.analysis?.displayLeftName || t('analysisSideA');
    if (side === 'right') return report?.displayRightName || report?.analysis?.displayRightName || t('analysisSideB');
  }

  return resolveDropPlayerLabel(drop, t);
}

function findRallyForSequence(sequence, rallies = []) {
  const seq = Number(sequence);
  if (!Number.isFinite(seq)) return null;
  return rallies.find((rally) => Number(rally?.sequence) === seq) || null;
}

function formatDropLabel(drop = {}, fallbackIndex = 0, t) {
  const timeLabel = drop.timeLabel || drop.elapsedLabel || '-';
  const playerLabel = !isUnknownLabel(drop.player)
    ? drop.player
    : resolveDropPlayerLabel(drop, t);
  return `${timeLabel} | ${playerLabel}`;
}

function buildHitSignature(hit = {}) {
  const sequence = Number.isFinite(hit.sequence) ? hit.sequence : '';
  const timeMs = Number.isFinite(hit.timestampMs)
    ? hit.timestampMs
    : Number.isFinite(hit.timeMs)
      ? hit.timeMs
      : '';
  const side = hit.side || hit.responsibleSide || '';
  return `${sequence}|${timeMs}|${side}`;
}

function getTimelineColumns(t) {
  return [
    { key: 'time', label: t('analysisTime') },
    { key: 'direction', label: t('analysisDirection') },
    { key: 'player', label: t('player') },
    { key: 'speed', label: t('analysisSpeed') },
    { key: 'base', label: t('baseScore') },
    { key: 'bonus', label: t('analysisBonusAmount') },
    { key: 'bonusType', label: t('analysisBonusType') },
    { key: 'total', label: t('totalScore') },
    { key: 'top150', label: 'Top 150' },
  ];
}

function sanitizeFileName(value = 'analysis') {
  return String(value || 'analysis')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'analysis';
}

function escapeCsvCell(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function downloadBlob(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function getUtf8ByteLength(value) {
  const text = String(value ?? '');
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(text).length;
  }
  return text.length;
}

async function uploadAnalysisRawText(reportId, text) {
  const response = await fetchWithApiFallback(`/api/uploads/analysis-reports/${encodeURIComponent(reportId)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
    body: text,
    timeoutMs: 2500,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(errorText || `Request failed with ${response.status}`);
  }

  return response.json();
}

async function fetchAnalysisRawText(rawTextUrl) {
  if (!rawTextUrl) return '';

  const response = await fetchWithApiFallback(rawTextUrl, {
    method: 'GET',
    timeoutMs: 2500,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(errorText || `Request failed with ${response.status}`);
  }

  return response.text();
}

async function loadStoredAnalysisData(record) {
  if (!record) return null;
  const existingAnalysis = record.analysis_data || record.analysisData || null;
  if (existingAnalysis) return existingAnalysis;

  const rawTextUrl = record.raw_text_url || record.rawTextUrl || '';
  if (!rawTextUrl) return null;

  const rawText = await fetchAnalysisRawText(rawTextUrl);
  if (!rawText) return null;

  const parsed = analyzeFrescogoReport(rawText, record.fileName || record.file_name || '');
  return parsed.kind === 'unknown' ? null : parsed;
}

function buildAnalysisExportContext(report, analysis) {
  const resolved = analysis || null;
  if (!resolved) return null;

  const summary = resolved.summary || {};
  const comparison = resolved.comparison || {};
  const primaryRule = summary.primaryRule || comparison.bestFitRule || 'rule1';
  const primaryRuleLabel = summary.primaryRuleLabel || (primaryRule === 'rule1' ? 'Regra 1' : 'Regra 2');
  const leftName = report?.displayLeftName || resolved.displayLeftName || '-';
  const rightName = report?.displayRightName || resolved.displayRightName || '-';
  const rows = resolved.rows || resolved.sideHits || resolved.hits || [];
  const rowsWithPrimary = assignTop150Ranks(buildPrimaryHits(rows, primaryRule, leftName, rightName));
  const leftRows = rowsWithPrimary.filter((hit) => hit.side === 'left');
  const rightRows = rowsWithPrimary.filter((hit) => hit.side === 'right');
  const leftSummary = resolved.playerSummary?.left || {};
  const rightSummary = resolved.playerSummary?.right || {};

  const leftPrimaryHits = Array.isArray(leftSummary.primaryHits) && leftSummary.primaryHits.length > 0
    ? leftSummary.primaryHits
    : leftRows.filter((hit) => hit.primaryIsTop150);
  const rightPrimaryHits = Array.isArray(rightSummary.primaryHits) && rightSummary.primaryHits.length > 0
    ? rightSummary.primaryHits
    : rightRows.filter((hit) => hit.primaryIsTop150);
  const duoPrimaryHits = rowsWithPrimary.filter((hit) => hit.primaryIsTop150);

  const sumBy = (hits, accessor) => hits.reduce((sum, hit) => sum + Number(accessor(hit) || 0), 0);
  const normalizeRally = (rally) => {
    const fullHits = Array.isArray(rally?.hits) ? rally.hits : [];
    return {
      ...rally,
      fullHits,
      fullHitCount: fullHits.length,
      displayTotal: sumBy(fullHits, (hit) => hit.primaryTotalScore),
      displayBaseTotal: sumBy(fullHits, (hit) => hit.primaryBaseScore),
      displayBonusTotal: sumBy(fullHits, (hit) => hit.primaryBonusScore),
      displayTop150Count: fullHits.filter((hit) => hit.primaryIsTop150).length,
    };
  };

  const rallies = (resolved.rallies || []).map(normalizeRally);

  return {
    report,
    analysis: resolved,
    summary,
    comparison,
    primaryRule,
    primaryRuleLabel,
    leftName,
    rightName,
    rowsWithPrimary,
    leftRows,
    rightRows,
    leftSummary,
    rightSummary,
    leftPrimaryHits,
    rightPrimaryHits,
    duoPrimaryHits,
    leftPrimaryBaseTotal: sumBy(leftPrimaryHits, (hit) => hit.primaryBaseScore),
    leftPrimaryBonusTotal: sumBy(leftPrimaryHits, (hit) => hit.primaryBonusScore),
    rightPrimaryBaseTotal: sumBy(rightPrimaryHits, (hit) => hit.primaryBaseScore),
    rightPrimaryBonusTotal: sumBy(rightPrimaryHits, (hit) => hit.primaryBonusScore),
    duoPrimaryBaseTotal: sumBy(duoPrimaryHits, (hit) => hit.primaryBaseScore),
    duoPrimaryBonusTotal: sumBy(duoPrimaryHits, (hit) => hit.primaryBonusScore),
    leftPrimaryTop150Count: leftPrimaryHits.length,
    rightPrimaryTop150Count: rightPrimaryHits.length,
    duoPrimaryTop150Count: duoPrimaryHits.length,
    rallies,
  };
}

function exportAnalysisCsv(context, t) {
  if (!context) return;
  const {
    report,
    summary,
    comparison,
    primaryRuleLabel,
    leftName,
    rightName,
    leftSummary,
    rightSummary,
    leftPrimaryBaseTotal,
    leftPrimaryBonusTotal,
    leftPrimaryTop150Count,
    rightPrimaryBaseTotal,
    rightPrimaryBonusTotal,
    rightPrimaryTop150Count,
    duoPrimaryBaseTotal,
    duoPrimaryBonusTotal,
    duoPrimaryTop150Count,
    rallies,
    rowsWithPrimary,
  } = context;

  const rows = [];
  const pushRow = (...cells) => rows.push(cells);
  const pushBlank = () => rows.push([]);

  pushRow(t('analysisFile'), report?.fileName || '-');
  pushRow('Date', report?.displayDate || '-');
  pushRow('Rule', primaryRuleLabel || '-');
  pushRow(t('analysisDuoScore'), formatValue(summary?.reportedTotal ?? 0));
  pushRow(t('analysisPrimaryScore'), formatValue(summary?.primaryTotal ?? 0));
  pushRow(t('analysisRows'), formatValue(summary?.totalHits ?? rowsWithPrimary.length));
  pushBlank();

  pushRow(t('analysisSideA'), leftName);
  pushRow(t('totalScore'), formatValue(leftSummary?.primaryTotal ?? leftSummary?.totalPoints ?? 0));
  pushRow(t('baseScore'), formatValue(leftPrimaryBaseTotal));
  pushRow(t('analysisBonusAmount'), `+${formatValue(leftPrimaryBonusTotal)}`);
  pushRow(t('analysisScoringBalls'), formatValue(leftPrimaryTop150Count));
  pushBlank();

  pushRow(t('analysisSideB'), rightName);
  pushRow(t('totalScore'), formatValue(rightSummary?.primaryTotal ?? rightSummary?.totalPoints ?? 0));
  pushRow(t('baseScore'), formatValue(rightPrimaryBaseTotal));
  pushRow(t('analysisBonusAmount'), `+${formatValue(rightPrimaryBonusTotal)}`);
  pushRow(t('analysisScoringBalls'), formatValue(rightPrimaryTop150Count));
  pushBlank();

  pushRow(t('analysisDuoScore'), formatValue(summary?.reportedTotal ?? 0));
  pushRow(t('baseScore'), formatValue(duoPrimaryBaseTotal));
  pushRow(t('analysisBonusAmount'), `+${formatValue(duoPrimaryBonusTotal)}`);
  pushRow(t('analysisScoringBalls'), formatValue(duoPrimaryTop150Count));
  pushBlank();

  pushRow(t('analysisTime'), t('analysisDirection'), t('player'), t('analysisSpeed'), t('baseScore'), t('analysisBonusAmount'), t('analysisBonusType'), t('totalScore'), 'Top 150');
  sortTimelineHits(rowsWithPrimary, { key: 'time', direction: 'asc' }).forEach((hit) => {
    const isDrop = Number(hit.speed) === 0;
    const playerLabel = resolveTimelinePlayerLabel(hit, leftName, rightName);
    pushRow(
      hit.elapsedLabel || '-',
      formatDirection(hit.direction),
      playerLabel,
      formatTimelineSpeed(hit),
      formatValue(hit.primaryBaseScore ?? 0),
      formatBonusValue(hit.primaryBonusScore),
      isDrop ? `${t('analysisResponsible')}: ${playerLabel}` : (hit.primaryBonusType || '-'),
      formatValue(hit.primaryTotalScore ?? 0),
      hit.primaryIsTop150 ? `#${String(hit.primaryTop150Rank || 0).padStart(2, '0')}` : '-',
    );
  });

  const csv = rows.map((row) => row.map((cell) => escapeCsvCell(cell)).join(',')).join('\n');
  downloadBlob(`\uFEFF${csv}`, `${sanitizeFileName(report?.fileName || 'analysis')}.csv`, 'text/csv;charset=utf-8;');
}

function exportAnalysisPdf(context, t) {
  if (!context) return;
  const {
    report,
    summary,
    primaryRuleLabel,
    leftName,
    rightName,
    leftSummary,
    rightSummary,
    leftPrimaryBaseTotal,
    leftPrimaryBonusTotal,
    leftPrimaryTop150Count,
    rightPrimaryBaseTotal,
    rightPrimaryBonusTotal,
    rightPrimaryTop150Count,
    duoPrimaryBaseTotal,
    duoPrimaryBonusTotal,
    duoPrimaryTop150Count,
    rallies,
    rowsWithPrimary,
  } = context;

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210;
  const margin = 14;
  const contentWidth = W - margin * 2;
  let y = 16;

  const ensureSpace = (needed = 6) => {
    if (y + needed <= 284) return;
    doc.addPage();
    y = 16;
  };

  const addLine = (text, { size = 8, color = [190, 190, 210], bold = false, gap = 5 } = {}) => {
    const lines = doc.splitTextToSize(String(text), contentWidth);
    lines.forEach((line, index) => {
      ensureSpace(size * 0.6 + 2);
      doc.setFontSize(size);
      doc.setTextColor(color[0], color[1], color[2]);
      doc.setFont('helvetica', bold ? 'bold' : 'normal');
      doc.text(line, margin, y);
      y += index === lines.length - 1 ? gap : size * 0.5 + 1;
    });
  };

  const addSection = (title) => {
    ensureSpace(10);
    doc.setFillColor(15, 155, 142);
    doc.roundedRect(margin, y - 1, contentWidth, 7, 2, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text(String(title), margin + 2, y + 4);
    y += 10;
  };

  const addKeyValue = (label, value) => {
    addLine(`${label}: ${value}`, { size: 8, color: [210, 210, 225], gap: 4 });
  };

  doc.setFillColor(13, 13, 26);
  doc.rect(0, 0, W, 297, 'F');
  doc.setFillColor(15, 155, 142);
  doc.rect(0, 0, W, 18, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('FrescoGO Analysis', W / 2, 12, { align: 'center' });

  addLine(report?.fileName || '-', { size: 13, color: [255, 255, 255], bold: true, gap: 4 });
  addLine(report?.displayDate || '-', { size: 9, color: [175, 175, 195], gap: 3 });
  addLine(primaryRuleLabel || '-', { size: 8, color: [15, 155, 142], bold: true, gap: 5 });

  addSection(t('analysisSummary'));
  addKeyValue(t('analysisDuoScore'), formatValue(summary?.reportedTotal ?? 0));
  addKeyValue(t('analysisPrimaryScore'), formatValue(summary?.primaryTotal ?? 0));
  addKeyValue(t('analysisRows'), formatValue(summary?.totalHits ?? 0));

  addSection(t('analysisSideA'));
  addKeyValue(t('analysisSideA'), leftName);
  addKeyValue(t('totalScore'), formatValue(leftSummary?.primaryTotal ?? leftSummary?.totalPoints ?? 0));
  addKeyValue(t('baseScore'), formatValue(leftPrimaryBaseTotal));
  addKeyValue(t('analysisBonusAmount'), `+${formatValue(leftPrimaryBonusTotal)}`);
  addKeyValue(t('analysisScoringBalls'), formatValue(leftPrimaryTop150Count));

  addSection(t('analysisSideB'));
  addKeyValue(t('analysisSideB'), rightName);
  addKeyValue(t('totalScore'), formatValue(rightSummary?.primaryTotal ?? rightSummary?.totalPoints ?? 0));
  addKeyValue(t('baseScore'), formatValue(rightPrimaryBaseTotal));
  addKeyValue(t('analysisBonusAmount'), `+${formatValue(rightPrimaryBonusTotal)}`);
  addKeyValue(t('analysisScoringBalls'), formatValue(rightPrimaryTop150Count));

  addSection(t('analysisDuoScore'));
  addKeyValue(t('totalScore'), formatValue(summary?.reportedTotal ?? 0));
  addKeyValue(t('baseScore'), formatValue(duoPrimaryBaseTotal));
  addKeyValue(t('analysisBonusAmount'), `+${formatValue(duoPrimaryBonusTotal)}`);
  addKeyValue(t('analysisScoringBalls'), formatValue(duoPrimaryTop150Count));

  addSection(t('analysisRows'));
  sortTimelineHits(rowsWithPrimary, { key: 'time', direction: 'asc' }).forEach((hit) => {
    const isDrop = Number(hit.speed) === 0;
    const playerLabel = resolveTimelinePlayerLabel(hit, leftName, rightName);
    addLine(
      `${hit.elapsedLabel || '-'} | ${formatDirection(hit.direction)} | ${playerLabel} | ${formatTimelineSpeed(hit)} | ${formatValue(hit.primaryBaseScore ?? 0)} | ${formatBonusValue(hit.primaryBonusScore)} | ${isDrop ? `${t('analysisResponsible')}: ${playerLabel}` : (hit.primaryBonusType || '-')} | ${formatValue(hit.primaryTotalScore ?? 0)} | ${hit.primaryIsTop150 ? `#${String(hit.primaryTop150Rank || 0).padStart(2, '0')}` : '-'}`,
      { size: 7, color: [200, 200, 218], gap: 3 },
    );
  });

  doc.save(`${sanitizeFileName(report?.fileName || 'analysis')}.pdf`);
}

function AnalysisExportToolbar({ report, analysis, t }) {
  const context = useMemo(() => buildAnalysisExportContext(report, analysis), [report, analysis]);
  const [downloading, setDownloading] = useState('');

  const handleExport = async (format) => {
    if (!context || downloading) return;
    setDownloading(format);
    try {
      if (format === 'csv') exportAnalysisCsv(context, t);
      if (format === 'pdf') exportAnalysisPdf(context, t);
    } finally {
      setDownloading('');
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => handleExport('csv')}
        disabled={!context || Boolean(downloading)}
        className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-gray-200 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <FileText className="h-3.5 w-3.5" />
        CSV
      </button>
      <button
        type="button"
        onClick={() => handleExport('pdf')}
        disabled={!context || Boolean(downloading)}
        className="inline-flex items-center gap-1.5 rounded-full bg-[#0f9b8e] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#0d847a] disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Download className="h-3.5 w-3.5" />
        PDF
      </button>
    </div>
  );
}

function formatDirection(direction = '') {
  if (direction === '->') return '->';
  if (direction === '<-') return '<-';
  return '-';
}

function getTimelineSortValue(hit, key) {
  switch (key) {
    case 'time':
      return Number(hit.elapsedSeconds ?? hit.timestampMs ?? 0);
    case 'direction':
      return String(hit.direction || '');
    case 'player':
      return String(hit.playerName || '');
    case 'speed':
      return Number(hit.speed || 0);
    case 'base':
      return Number(hit.primaryBaseScore || 0);
    case 'bonus':
      return Number(hit.primaryBonusScore || 0);
    case 'bonusType':
      return String(hit.primaryBonusType || '');
    case 'total':
      return Number(hit.primaryTotalScore || 0);
    case 'top150':
      return hit.primaryIsTop150 ? Number(hit.primaryTop150Rank || 0) : Number.MAX_SAFE_INTEGER;
    default:
      return Number(hit.index || 0);
  }
}

function sortTimelineHits(hits = [], sortConfig = { key: 'time', direction: 'asc' }) {
  const dir = sortConfig.direction === 'desc' ? -1 : 1;
  return [...hits].sort((a, b) => {
    if (sortConfig.key === 'top150') {
      const aTop = Boolean(a.primaryIsTop150);
      const bTop = Boolean(b.primaryIsTop150);
      if (aTop !== bTop) return aTop ? -1 : 1;
      const aRank = Number(a.primaryTop150Rank || 0);
      const bRank = Number(b.primaryTop150Rank || 0);
      if (aRank !== bRank) return (aRank - bRank) * dir;
      return (Number(a.index || 0) - Number(b.index || 0)) * dir;
    }
    const left = getTimelineSortValue(a, sortConfig.key);
    const right = getTimelineSortValue(b, sortConfig.key);
    if (typeof left === 'string' || typeof right === 'string') {
      const result = String(left).localeCompare(String(right), 'pt');
      if (result !== 0) return result * dir;
    } else if (left !== right) {
      return (left - right) * dir;
    }
    return (Number(a.index || 0) - Number(b.index || 0)) * dir;
  });
}

function sortScoringHitsByPoints(hits = []) {
  return [...hits].sort((a, b) => (
    Number(b.primaryTotalScore || 0) - Number(a.primaryTotalScore || 0)
    || Number(b.primaryBonusScore || 0) - Number(a.primaryBonusScore || 0)
    || Number(b.speed || 0) - Number(a.speed || 0)
    || Number(a.index || 0) - Number(b.index || 0)
  ));
}

function getPrimaryHitData(hit = null, primaryRule = 'rule1') {
  if (!hit) return null;
  const fallback = primaryRule === 'rule1' ? hit.rule1 : hit.rule2;
  const direct = hit.primaryRule ? {
    rule: hit.primaryRule,
    label: hit.primaryRuleLabel || (hit.primaryRule === 'rule1' ? 'Regra 1' : 'Regra 2'),
    baseScore: Number(hit.primaryBaseScore || 0),
    bonusScore: Number(hit.primaryBonusScore || 0),
    totalScore: Number(hit.primaryTotalScore || 0),
    bonusType: hit.primaryBonusType || '',
    hasBonus: Boolean(hit.primaryHasBonus),
    isTop150: Boolean(hit.primaryIsTop150),
  } : null;

  if (direct) return direct;

  return {
    rule: primaryRule,
    label: primaryRule === 'rule1' ? 'Regra 1' : 'Regra 2',
    baseScore: Number(fallback?.baseScore || 0),
    bonusScore: Number(fallback?.bonusScore || 0),
    totalScore: Number(fallback?.totalScore || 0),
    bonusType: fallback?.bonusType || '',
    hasBonus: Boolean(fallback?.hasBonus),
    isTop150: Boolean(fallback?.isTop150),
  };
}

function buildPrimaryHits(rows = [], primaryRule = 'rule1', leftName = '', rightName = '') {
  return rows.map((row) => {
    const primary = getPrimaryHitData(row, primaryRule);
    return {
      ...row,
      playerName: row.playerName || (row.side === 'left' ? leftName : rightName),
      primaryRule: primary.rule,
      primaryRuleLabel: primary.label,
      primaryBaseScore: primary.baseScore,
      primaryBonusScore: primary.bonusScore,
      primaryTotalScore: primary.totalScore,
      primaryBonusType: primary.bonusType,
      primaryHasBonus: primary.hasBonus,
      primaryIsTop150: primary.isTop150,
    };
  });
}

function getHitIdentity(hit = {}) {
  return [
    hit.sequence ?? '',
    hit.index ?? '',
    hit.timestampMs ?? hit.rawTime ?? '',
    hit.side ?? '',
    hit.playerName ?? '',
  ].join('|');
}

function assignTop150Ranks(rows = []) {
  const ranked = [...rows]
    .filter((hit) => hit.primaryIsTop150)
    .sort((a, b) => (
      Number(b.primaryTotalScore || 0) - Number(a.primaryTotalScore || 0)
      || Number(b.primaryBonusScore || 0) - Number(a.primaryBonusScore || 0)
      || Number(b.speed || 0) - Number(a.speed || 0)
      || Number(a.index || 0) - Number(b.index || 0)
    ));

  const rankMap = new Map(ranked.map((hit, index) => [getHitIdentity(hit), index + 1]));

  return rows.map((hit) => ({
    ...hit,
    primaryTop150Rank: rankMap.get(getHitIdentity(hit)) || null,
  }));
}

function normalizeAnalysisRecord(record) {
  if (!record) return null;
  const analysis = record.analysis_data || record.analysisData || record;
  return {
    ...record,
    analysis,
    kind: record.kind || analysis.kind || 'unknown',
    fileName: record.file_name || record.fileName || analysis.fileName || analysis.sourceFileName || 'report',
    displayDate: record.display_date || record.displayDate || analysis.displayDate || analysis.date || '',
    displayLeftName: record.display_left_name || record.displayLeftName || analysis.displayLeftName || '',
    displayRightName: record.display_right_name || record.displayRightName || analysis.displayRightName || '',
    displayScore: record.display_score ?? record.displayScore ?? analysis.displayScore ?? analysis.totalPoints ?? 0,
  };
}

function resolveMatchAnalysis(report) {
  const analysis = report?.analysis || null;
  if (!analysis) return null;
  if (analysis.kind === 'match') {
    return buildFrescogoCombinedAnalysis({
      csvReport: analysis.csv || null,
      txtReport: analysis.txt || null,
      existingAnalysis: analysis,
    });
  }
  if (analysis.kind === 'txt') {
    return buildFrescogoCombinedAnalysis({ txtReport: analysis, existingAnalysis: analysis });
  }
  if (analysis.kind === 'csv') {
    return buildFrescogoCombinedAnalysis({ csvReport: analysis, existingAnalysis: analysis });
  }
  return analysis;
}

function hydrateAnalysisRecord(record) {
  const normalized = normalizeAnalysisRecord(record);
  if (!normalized) return null;

  const analysis = normalized.analysis || null;
  const rawText = normalized.raw_text || normalized.rawText || '';
  if (!analysis && !rawText) return normalized;

  let csvReport = null;
  let txtReport = null;

  if (analysis?.kind === 'match') {
    csvReport = analysis.csv || null;
    txtReport = analysis.txt || null;
  } else if (analysis?.kind === 'txt') {
    txtReport = analysis;
  } else if (analysis?.kind === 'csv') {
    csvReport = analysis;
  }

  if (rawText) {
    const parsed = analyzeFrescogoReport(rawText, normalized.fileName || normalized.file_name || '');
    if (parsed.kind === 'txt') txtReport = parsed;
    if (parsed.kind === 'csv') csvReport = parsed;
  }

  const combined = buildFrescogoCombinedAnalysis({
    csvReport,
    txtReport,
    existingAnalysis: analysis,
  });

  return {
    ...normalized,
    analysis: combined,
    kind: combined.kind,
    displayDate: combined.displayDate || normalized.displayDate,
    displayLeftName: combined.displayLeftName || normalized.displayLeftName,
    displayRightName: combined.displayRightName || normalized.displayRightName,
    displayScore: combined.displayScore ?? normalized.displayScore,
  };
}

async function loadAnalysisReportDetail(record) {
  const normalized = normalizeAnalysisRecord(record);
  if (!normalized) return null;

  const rawText = normalized.raw_text || normalized.rawText || (normalized.raw_text_url
    ? await fetchAnalysisRawText(normalized.raw_text_url)
    : '');

  if (!rawText) {
    return hydrateAnalysisRecord(normalized);
  }

  const parsed = analyzeFrescogoReport(rawText, normalized.fileName || normalized.file_name || '');
  const combined = buildFrescogoCombinedAnalysis({
    csvReport: parsed.kind === 'csv' ? parsed : null,
    txtReport: parsed.kind === 'txt' ? parsed : null,
    existingAnalysis: normalized.analysis || null,
  });

  return hydrateAnalysisRecord({
    ...normalized,
    analysis_data: combined,
    analysis: combined,
    kind: combined.kind,
    displayDate: combined.displayDate || normalized.displayDate,
    displayLeftName: combined.displayLeftName || normalized.displayLeftName,
    displayRightName: combined.displayRightName || normalized.displayRightName,
    displayScore: combined.displayScore ?? normalized.displayScore,
  });
}

function ReportBadge({ label, value, tone = 'neutral' }) {
  const toneClass = tone === 'positive'
    ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-200'
    : tone === 'warning'
      ? 'border-amber-500/30 bg-amber-500/15 text-amber-200'
      : tone === 'danger'
        ? 'border-red-500/30 bg-red-500/15 text-red-200'
        : 'border-slate-500/30 bg-slate-500/15 text-slate-200';

  return (
    <div className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${toneClass}`}>
      {label}: {value}
    </div>
  );
}

function StoredReportCard({ report, onOpen, onDelete, t }) {
  const dateLabel = formatValue(report.displayDate || report.analysis?.displayDate || report.fileName);
  const scoreLabel = formatValue(report.displayScore ?? report.analysis?.displayScore ?? report.analysis?.totalPoints ?? 0);
  const leftName = formatValue(report.displayLeftName || report.analysis?.displayLeftName || report.analysis?.leftName || report.fileName);
  const rightName = formatValue(report.displayRightName || report.analysis?.displayRightName || report.analysis?.rightName || '');

  return (
    <div className="rounded-3xl border border-[#2a2a4a] bg-[#0d0d1a] p-4 shadow-lg shadow-black/20">
      <button type="button" onClick={onOpen} className="w-full text-left">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="mt-1 text-xl font-black text-white">{dateLabel}</p>
          </div>
          <div className="rounded-full border border-[#0f9b8e]/30 bg-[#16213e] px-3 py-2 text-right">
            <p className="text-[10px] uppercase tracking-[0.18em] text-gray-500">{t('analysisSummary')}</p>
            <p className="text-sm font-black text-[#0f9b8e]">{scoreLabel}</p>
          </div>
        </div>
        <div className="mt-3 rounded-2xl border border-white/5 bg-white/5 px-3 py-2">
          <p className="text-xs text-gray-300">
            <span className="font-semibold text-white">{leftName}</span>
            <span className="mx-2 text-gray-500">-</span>
            <span className="font-semibold text-white">{rightName || '-'}</span>
          </p>
        </div>
      </button>
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-300">
          {report.kind === 'match' ? t('analysisFormatMatch') : report.kind === 'txt' ? t('analysisFormatTxt') : report.kind === 'csv' ? t('analysisFormatCsv') : t('analysisFile')}
        </span>
        <button
          type="button"
          onClick={onDelete}
          className="inline-flex items-center gap-2 rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-200 transition-colors hover:bg-red-500/20"
        >
          <Trash2 className="h-3.5 w-3.5" />
          {t('analysisDeleteReport')}
        </button>
      </div>
    </div>
  );
}

function ScoringHitsTable({ title, hits, t, showPlayer = false }) {
  const visibleHits = sortScoringHitsByPoints(Array.isArray(hits) ? hits : []);

  return (
    <div className="rounded-[1.75rem] border border-[#2a2a4a] bg-[#0d0d1a] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-gray-500">{title}</p>
          <p className="mt-1 text-sm text-gray-400">
            {visibleHits.length} {t('analysisRows')}
          </p>
        </div>
        <span className="rounded-full border border-emerald-500/30 bg-emerald-500/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-200">
          {t('analysisScoringBalls')}
        </span>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-[#2a2a4a] bg-[#16213e]">
        <div className="max-h-[28rem] overflow-auto">
          <table className="min-w-full text-left text-xs">
            <thead className="sticky top-0 bg-[#16213e] text-[10px] uppercase tracking-[0.18em] text-gray-500">
              <tr>
                <th className="px-3 py-2">{t('analysisTime')}</th>
                {showPlayer && <th className="px-3 py-2">{t('player')}</th>}
                <th className="px-3 py-2 text-center">{t('analysisSpeed')}</th>
                <th className="px-3 py-2 text-center">{t('points')}</th>
                <th className="px-3 py-2 text-center">{t('analysisBonusAmount')}</th>
                <th className="px-3 py-2">{t('analysisBonusType')}</th>
                <th className="px-3 py-2">Top 150</th>
              </tr>
            </thead>
            <tbody>
              {visibleHits.map((hit, index) => {
                const bonusClass = hit.primaryBonusScore > 0
                  ? 'border-amber-500/30 bg-amber-500/15 text-amber-200'
                  : 'border-white/10 bg-white/5 text-gray-500';
                const speedLabel = formatTimelineSpeed(hit);
                return (
                  <tr
                    key={`${hit.sequence}-${hit.index}-${hit.rawTime}-${index}`}
                    className={`border-t border-white/5 ${hit.primaryBonusScore > 0 ? 'bg-amber-500/5' : ''}`}
                  >
                    <td className="px-3 py-2 text-gray-300">{hit.elapsedLabel || '-'}</td>
                    {showPlayer && <td className="px-3 py-2 text-gray-200">{hit.playerName || '-'}</td>}
                    <td className="px-3 py-2 text-center font-semibold text-white">{speedLabel}</td>
                    <td className="px-3 py-2 text-center text-gray-100">{formatValue(hit.primaryTotalScore ?? 0)}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`inline-flex min-w-16 items-center justify-center rounded-full border px-2 py-1 text-[10px] font-black ${bonusClass}`}>
                        {hit.primaryBonusScore > 0 ? `+${formatValue(hit.primaryBonusScore)}` : '-'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-300">{hit.primaryBonusType || '-'}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`inline-flex items-center justify-center rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${
                        hit.primaryIsTop150
                          ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-200'
                          : 'border-white/10 bg-white/5 text-gray-500'
                      }`}>
                        {hit.primaryIsTop150 ? `#${String(hit.primaryTop150Rank || 0).padStart(2, '0')}` : '-'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function DetailBallSummary({ label, value, tone = 'neutral' }) {
  return <ReportBadge label={label} value={value} tone={tone} />;
}

function TxtAnalysisDetail({ report, txt, t }) {
  const summary = txt.summary || {};
  const comparison = txt.comparison || {};
  const primaryRule = summary.primaryRule || comparison.bestFitRule || 'rule1';
  const primaryRuleLabel = primaryRule === 'rule1'
    ? t('analysisRule1Label')
    : primaryRule === 'rule2'
      ? t('analysisRule2Label')
      : t('analysisBestRule');
  const duoScore = summary.reportedTotal ?? txt.totalPoints ?? report.displayScore ?? 0;
  const primaryScore = summary.primaryTotal ?? (primaryRule === 'rule1' ? comparison.rule1Total : comparison.rule2Total) ?? 0;
  const primaryDifference = summary.primaryDifference ?? (primaryRule === 'rule1' ? comparison.rule1Difference : comparison.rule2Difference) ?? 0;
  const leftSummary = txt.playerSummary?.left || {};
  const rightSummary = txt.playerSummary?.right || {};
  const rallies = txt.rallies || [];
  const rows = txt.rows || txt.sideHits || txt.hits || [];
  const rowsWithPrimary = buildPrimaryHits(rows, primaryRule, report.displayLeftName || '', report.displayRightName || '');
  const rankedRowsWithPrimary = assignTop150Ranks(rowsWithPrimary);
  const duos = sortScoringHitsByPoints(
    txt.duoScoringHits?.length
      ? txt.duoScoringHits
      : rankedRowsWithPrimary.filter((hit) => hit.primaryIsTop150),
  );
  const leftHits = sortScoringHitsByPoints(
    leftSummary.primaryHits?.length
      ? leftSummary.primaryHits
      : rankedRowsWithPrimary.filter((hit) => hit.side === 'left' && hit.primaryIsTop150),
  );
  const rightHits = sortScoringHitsByPoints(
    rightSummary.primaryHits?.length
      ? rightSummary.primaryHits
      : rankedRowsWithPrimary.filter((hit) => hit.side === 'right' && hit.primaryIsTop150),
  );
  const leftBestBall = leftSummary.bestBall || [...leftHits].sort((a, b) => b.primaryTotalScore - a.primaryTotalScore || b.speed - a.speed || a.index - b.index)[0] || null;
  const leftWorstBall = leftSummary.worstBall || [...leftHits].sort((a, b) => b.primaryTotalScore - a.primaryTotalScore || b.speed - a.speed || a.index - b.index).at(-1) || null;
  const rightBestBall = rightSummary.bestBall || [...rightHits].sort((a, b) => b.primaryTotalScore - a.primaryTotalScore || b.speed - a.speed || a.index - b.index)[0] || null;
  const rightWorstBall = rightSummary.worstBall || [...rightHits].sort((a, b) => b.primaryTotalScore - a.primaryTotalScore || b.speed - a.speed || a.index - b.index).at(-1) || null;
  const leftBonusCount = Number.isFinite(leftSummary.bonusCount) ? leftSummary.bonusCount : leftHits.filter((hit) => hit.primaryHasBonus).length;
  const rightBonusCount = Number.isFinite(rightSummary.bonusCount) ? rightSummary.bonusCount : rightHits.filter((hit) => hit.primaryHasBonus).length;
  const leftPrimaryBaseTotal = leftHits.reduce((sum, hit) => sum + Number(hit.primaryBaseScore || 0), 0);
  const leftPrimaryBonusTotal = leftHits.reduce((sum, hit) => sum + Number(hit.primaryBonusScore || 0), 0);
  const rightPrimaryBaseTotal = rightHits.reduce((sum, hit) => sum + Number(hit.primaryBaseScore || 0), 0);
  const rightPrimaryBonusTotal = rightHits.reduce((sum, hit) => sum + Number(hit.primaryBonusScore || 0), 0);
  const leftPrimaryTop150Count = leftHits.length;
  const rightPrimaryTop150Count = rightHits.length;
  const dropEvents = Array.isArray(summary.dropEvents) ? summary.dropEvents : [];
  const leftDropCount = dropEvents.filter((drop) => {
    const label = !isUnknownLabel(drop.responsiblePlayer) ? drop.responsiblePlayer : '';
    return label === (report.displayLeftName || leftSummary.name || t('analysisSideA')) || drop.responsibleSide === 'left';
  }).length || (Number.isFinite(summary.leftDrops) ? summary.leftDrops : 0);
  const rightDropCount = dropEvents.filter((drop) => {
    const label = !isUnknownLabel(drop.responsiblePlayer) ? drop.responsiblePlayer : '';
    return label === (report.displayRightName || rightSummary.name || t('analysisSideB')) || drop.responsibleSide === 'right';
  }).length || (Number.isFinite(summary.rightDrops) ? summary.rightDrops : 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-gray-500">{t('analysisFile')}</p>
          <h3 className="mt-1 text-xl font-black text-white">{report.fileName}</h3>
          <p className="text-sm text-gray-400">{report.displayDate || '-'}</p>
          <p className="mt-1 text-xs text-gray-500">{txt.version || '-'}</p>
        </div>
        <span className="rounded-full border border-[#0f9b8e]/30 bg-[#0d0d1a] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#0f9b8e]">
          {t('analysisFormatTxt')}
        </span>
      </div>

      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        <ReportBadge label={t('analysisDuoScore')} value={duoScore} tone="positive" />
        <ReportBadge label={t('analysisBestRule')} value={primaryRuleLabel || '-'} tone="warning" />
        <ReportBadge label={t('analysisPrimaryScore')} value={`${primaryScore} (${primaryDifference})`} />
        <ReportBadge label={t('analysisScoringBalls')} value={summary.duoScoringCount || duos.length || 0} />
      </div>

      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        <ReportBadge label={t('analysisRows')} value={summary.totalHits || 0} />
        <ReportBadge label={t('analysisPlusMarkers')} value={summary.plusCount || 0} tone={(summary.plusCount || 0) > 0 ? 'warning' : 'neutral'} />
        <ReportBadge label={t('analysisFceMatches')} value={summary.fceBonusCount || 0} tone={(summary.fceBonusCount || 0) > 0 ? 'positive' : 'neutral'} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-[1.75rem] border border-[#2a2a4a] bg-[#0d0d1a] p-4">
          <p className="text-xs uppercase tracking-[0.22em] text-gray-500">{t('analysisSideA')}</p>
          <div className="mt-2">
            <div>
              <p className="text-lg font-black text-white">{leftSummary.name || report.displayLeftName || '-'}</p>
              <p className="text-xs text-gray-500">{t('analysisRows')}: {leftSummary.hits ?? 0}</p>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <BallSummaryLine label={t('analysisBestBall')} ball={leftBestBall} tone="positive" t={t} />
              <BallSummaryLine label={t('analysisWorstBall')} ball={leftWorstBall} tone="warning" t={t} />
              <SummaryMetricTile label={t('analysisAvgSpeed')} value={`${formatDecimal(leftSummary.avgSpeed, 1)} km/h`} />
              <SummaryMetricTile label={t('analysisMaxSpeed')} value={`${formatValue(leftSummary.maxSpeed || 0)} km/h`} />
              <SummaryMetricTile label={t('analysisDrops')} value={formatValue(leftDropCount)} />
              <SummaryMetricTile label={t('analysisBonusCount')} value={formatValue(leftBonusCount)} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <SummaryMetricTile label={t('totalScore')} value={formatValue(leftSummary.primaryTotal ?? leftSummary.totalPoints ?? 0)} tone="positive" />
              <SummaryMetricTile label={t('baseScore')} value={formatValue(leftPrimaryBaseTotal)} />
              <SummaryMetricTile label={t('analysisBonusAmount')} value={`+${formatValue(leftPrimaryBonusTotal)}`} tone={leftPrimaryBonusTotal > 0 ? 'warning' : 'neutral'} />
              <SummaryMetricTile label={t('analysisScoringBalls')} value={formatValue(leftPrimaryTop150Count)} />
            </div>
          </div>
        </div>

        <div className="rounded-[1.75rem] border border-[#2a2a4a] bg-[#0d0d1a] p-4">
          <p className="text-xs uppercase tracking-[0.22em] text-gray-500">{t('analysisSideB')}</p>
          <div className="mt-2">
            <div>
              <p className="text-lg font-black text-white">{rightSummary.name || report.displayRightName || '-'}</p>
              <p className="text-xs text-gray-500">{t('analysisRows')}: {rightSummary.hits ?? 0}</p>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <BallSummaryLine label={t('analysisBestBall')} ball={rightBestBall} tone="positive" t={t} />
              <BallSummaryLine label={t('analysisWorstBall')} ball={rightWorstBall} tone="warning" t={t} />
              <SummaryMetricTile label={t('analysisAvgSpeed')} value={`${formatDecimal(rightSummary.avgSpeed, 1)} km/h`} />
              <SummaryMetricTile label={t('analysisMaxSpeed')} value={`${formatValue(rightSummary.maxSpeed || 0)} km/h`} />
              <SummaryMetricTile label={t('analysisDrops')} value={formatValue(rightDropCount)} />
              <SummaryMetricTile label={t('analysisBonusCount')} value={formatValue(rightBonusCount)} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <SummaryMetricTile label={t('totalScore')} value={formatValue(rightSummary.primaryTotal ?? rightSummary.totalPoints ?? 0)} tone="positive" />
              <SummaryMetricTile label={t('baseScore')} value={formatValue(rightPrimaryBaseTotal)} />
              <SummaryMetricTile label={t('analysisBonusAmount')} value={`+${formatValue(rightPrimaryBonusTotal)}`} tone={rightPrimaryBonusTotal > 0 ? 'warning' : 'neutral'} />
              <SummaryMetricTile label={t('analysisScoringBalls')} value={formatValue(rightPrimaryTop150Count)} />
            </div>
          </div>
        </div>
      </div>

      <ScoringHitsTable
        title={`${t('analysisScoringBalls')} · ${t('duo')}`}
        hits={duos}
        t={t}
        showPlayer
      />

      <ScoringHitsTable
        title={`${t('analysisScoringBalls')} · ${leftSummary.name || report.displayLeftName || t('analysisSideA')}`}
        hits={leftHits}
        t={t}
      />

      <ScoringHitsTable
        title={`${t('analysisScoringBalls')} · ${rightSummary.name || report.displayRightName || t('analysisSideB')}`}
        hits={rightHits}
        t={t}
      />
    </div>
  );
}

function TxtTimelineDetail({ report, txt, analysisData = null, t }) {
  const [scope, setScope] = useState('duo');
  const [sortConfig, setSortConfig] = useState({ key: 'time', direction: 'asc' });
  const exportSource = analysisData || txt;
  const summary = txt.summary || {};
  const comparison = txt.comparison || {};
  const primaryRule = summary.primaryRule || comparison.bestFitRule || 'rule1';
  const primaryRuleLabel = primaryRule === 'rule1'
    ? t('analysisRule1Label')
    : primaryRule === 'rule2'
      ? t('analysisRule2Label')
      : t('analysisBestRule');
  const primaryScore = summary.primaryTotal ?? (primaryRule === 'rule1' ? comparison.rule1Total : comparison.rule2Total) ?? 0;
  const primaryDifference = summary.primaryDifference ?? (primaryRule === 'rule1' ? comparison.rule1Difference : comparison.rule2Difference) ?? 0;
  const duoScore = summary.reportedTotal ?? txt.totalPoints ?? report.displayScore ?? 0;

  const rows = txt.rows || txt.sideHits || txt.hits || [];
  const rowsWithPrimary = buildPrimaryHits(rows, primaryRule, report.displayLeftName || '', report.displayRightName || '');
  const rankedRowsWithPrimary = assignTop150Ranks(rowsWithPrimary);
  const leftRows = rankedRowsWithPrimary.filter((hit) => hit.side === 'left');
  const rightRows = rankedRowsWithPrimary.filter((hit) => hit.side === 'right');
  const leftSummary = txt.playerSummary?.left || {};
  const rightSummary = txt.playerSummary?.right || {};
  const leftBonusCount = Number.isFinite(leftSummary.bonusCount) ? leftSummary.bonusCount : leftRows.filter((hit) => hit.primaryHasBonus).length;
  const rightBonusCount = Number.isFinite(rightSummary.bonusCount) ? rightSummary.bonusCount : rightRows.filter((hit) => hit.primaryHasBonus).length;
  const leftBestBall = leftSummary.bestBall || sortScoringHitsByPoints(leftRows)[0] || null;
  const leftWorstBall = leftSummary.worstBall || sortScoringHitsByPoints(leftRows).at(-1) || null;
  const rightBestBall = rightSummary.bestBall || sortScoringHitsByPoints(rightRows)[0] || null;
  const rightWorstBall = rightSummary.worstBall || sortScoringHitsByPoints(rightRows).at(-1) || null;
  const leftPrimaryHits = Array.isArray(leftSummary.primaryHits) && leftSummary.primaryHits.length > 0
    ? leftSummary.primaryHits
    : leftRows.filter((hit) => hit.primaryIsTop150);
  const rightPrimaryHits = Array.isArray(rightSummary.primaryHits) && rightSummary.primaryHits.length > 0
    ? rightSummary.primaryHits
    : rightRows.filter((hit) => hit.primaryIsTop150);
  const duoPrimaryHits = rowsWithPrimary.filter((hit) => hit.primaryIsTop150);
  const leftPrimaryBaseTotal = leftPrimaryHits.reduce((sum, hit) => sum + Number(hit.primaryBaseScore || 0), 0);
  const leftPrimaryBonusTotal = leftPrimaryHits.reduce((sum, hit) => sum + Number(hit.primaryBonusScore || 0), 0);
  const rightPrimaryBaseTotal = rightPrimaryHits.reduce((sum, hit) => sum + Number(hit.primaryBaseScore || 0), 0);
  const rightPrimaryBonusTotal = rightPrimaryHits.reduce((sum, hit) => sum + Number(hit.primaryBonusScore || 0), 0);
  const duoPrimaryBaseTotal = duoPrimaryHits.reduce((sum, hit) => sum + Number(hit.primaryBaseScore || 0), 0);
  const duoPrimaryBonusTotal = duoPrimaryHits.reduce((sum, hit) => sum + Number(hit.primaryBonusScore || 0), 0);
  const leftPrimaryTop150Count = leftPrimaryHits.length;
  const rightPrimaryTop150Count = rightPrimaryHits.length;
  const duoPrimaryTop150Count = duoPrimaryHits.length;
  const rallies = txt.rallies || [];
  const dropEvents = Array.isArray(summary.dropEvents) ? summary.dropEvents : [];
  const leftDropLabel = report.displayLeftName || leftSummary.name || t('analysisSideA');
  const rightDropLabel = report.displayRightName || rightSummary.name || t('analysisSideB');
  let leftDropCount = 0;
  let rightDropCount = 0;
  const dropSignatureSet = new Set(dropEvents.map((drop) => buildHitSignature({
    sequence: drop.sequence,
    timestampMs: drop.timeMs,
    side: drop.responsibleSide,
  })));
  const timelineColumns = getTimelineColumns(t);
  const dropCards = dropEvents.map((drop, index) => {
    const rally = findRallyForSequence(drop.sequence, rallies);
    const player = rally ? resolveRallyDropPlayerLabel(rally, report, t) : resolveDropPlayerLabel(drop, t);
    return {
      ...drop,
      index,
      player,
    };
  });
  leftDropCount = dropCards.filter((drop) => drop.responsibleSide === 'left' || drop.player === leftDropLabel).length
    || (Number.isFinite(summary.leftDrops) ? summary.leftDrops : 0);
  rightDropCount = dropCards.filter((drop) => drop.responsibleSide === 'right' || drop.player === rightDropLabel).length
    || (Number.isFinite(summary.rightDrops) ? summary.rightDrops : 0);
  const scopeHits = useMemo(() => {
    if (scope === 'left') return leftRows;
    if (scope === 'right') return rightRows;
    return rankedRowsWithPrimary;
  }, [scope, leftRows, rightRows, rankedRowsWithPrimary]);
  const visibleHits = useMemo(() => sortTimelineHits(scopeHits, sortConfig), [scopeHits, sortConfig]);

  const scopeOptions = [
    { value: 'duo', label: t('duo') },
    { value: 'left', label: report.displayLeftName || t('analysisSideA') },
    { value: 'right', label: report.displayRightName || t('analysisSideB') },
  ];
  const visibleHitsCount = visibleHits.length;

  const handleSort = (key) => {
    setSortConfig((current) => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-gray-500">{t('analysisFile')}</p>
          <h3 className="mt-1 text-xl font-black text-white">{report.fileName}</h3>
          <p className="text-sm text-gray-400">{report.displayDate || '-'}</p>
          <p className="mt-1 text-xs text-gray-500">{txt.version || '-'}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-[#0f9b8e]/30 bg-[#0d0d1a] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#0f9b8e]">
            {t('analysisFormatTxt')}
          </span>
          <AnalysisExportToolbar report={report} analysis={exportSource} t={t} />
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        <ReportBadge label={t('analysisPrimaryScore')} value={`${primaryScore} (${primaryDifference})`} />
        <ReportBadge label={t('analysisScoringBalls')} value={summary.duoScoringCount || rowsWithPrimary.filter((hit) => hit.primaryIsTop150).length || 0} />
      </div>

      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        <ReportBadge label={t('analysisRows')} value={summary.totalHits || rows.length || 0} />
      </div>

      <div className="grid gap-2 md:grid-cols-4">
        <ReportBadge label={t('analysisDuoScore')} value={formatValue(summary.reportedTotal ?? duoScore ?? 0)} tone="positive" />
        <ReportBadge label={t('baseScore')} value={formatValue(duoPrimaryBaseTotal)} />
        <ReportBadge label={t('analysisBonusAmount')} value={`+${formatValue(duoPrimaryBonusTotal)}`} tone={duoPrimaryBonusTotal > 0 ? 'warning' : 'neutral'} />
        <ReportBadge label={t('analysisScoringBalls')} value={formatValue(duoPrimaryTop150Count)} />
      </div>

      <div className="rounded-[1.75rem] border border-[#2a2a4a] bg-[#0d0d1a] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-gray-500">{t('analysisDrops')}</p>
            <p className="mt-1 text-sm text-gray-400">
              {formatValue(dropEvents.length)} {t('analysisRows')}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <ReportBadge label={t('analysisSideA')} value={formatValue(leftDropCount)} tone="warning" />
            <ReportBadge label={t('analysisSideB')} value={formatValue(rightDropCount)} tone="warning" />
          </div>
        </div>
        <div className="mt-3 space-y-2">
          {dropCards.length > 0 ? dropCards.map((drop) => (
            <div key={`${drop.sequence}-${drop.timeMs}-${drop.index}`} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/8 px-3 py-2 text-sm text-gray-200">
              <span className="font-semibold text-amber-200">{formatDropLabel(drop, drop.index + 1, t)}</span>
              <span className="text-xs text-gray-400">
                {t('analysisResponsible')}: {drop.player}
              </span>
            </div>
          )) : (
            <p className="rounded-2xl border border-dashed border-white/10 bg-white/5 px-3 py-4 text-sm text-gray-400">
              {t('analysisNoDrops')}
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-[1.75rem] border border-[#2a2a4a] bg-[#0d0d1a] p-4">
          <p className="text-xs uppercase tracking-[0.22em] text-gray-500">{t('analysisSideA')}</p>
          <div className="mt-2">
            <div>
              <p className="text-lg font-black text-white">{leftSummary.name || report.displayLeftName || '-'}</p>
              <p className="text-xs text-gray-500">{t('analysisRows')}: {leftSummary.hits ?? leftRows.length}</p>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <BallSummaryLine label={t('analysisBestBall')} ball={leftBestBall} tone="positive" t={t} />
              <BallSummaryLine label={t('analysisWorstBall')} ball={leftWorstBall} tone="warning" t={t} />
              <SummaryMetricTile label={t('analysisAvgSpeed')} value={`${formatDecimal(leftSummary.avgSpeed, 1)} km/h`} />
              <SummaryMetricTile label={t('analysisMaxSpeed')} value={`${formatValue(leftSummary.maxSpeed || 0)} km/h`} />
              <SummaryMetricTile label={t('analysisDrops')} value={formatValue(leftDropCount)} />
              <SummaryMetricTile label={t('analysisBonusCount')} value={formatValue(leftBonusCount)} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <SummaryMetricTile label={t('totalScore')} value={formatValue(leftSummary.primaryTotal ?? leftSummary.totalPoints ?? 0)} tone="positive" />
              <SummaryMetricTile label={t('baseScore')} value={formatValue(leftPrimaryBaseTotal)} />
              <SummaryMetricTile label={t('analysisBonusAmount')} value={`+${formatValue(leftPrimaryBonusTotal)}`} tone={leftPrimaryBonusTotal > 0 ? 'warning' : 'neutral'} />
              <SummaryMetricTile label={t('analysisScoringBalls')} value={formatValue(leftPrimaryTop150Count)} />
            </div>
          </div>
        </div>

        <div className="rounded-[1.75rem] border border-[#2a2a4a] bg-[#0d0d1a] p-4">
          <p className="text-xs uppercase tracking-[0.22em] text-gray-500">{t('analysisSideB')}</p>
          <div className="mt-2">
            <div>
              <p className="text-lg font-black text-white">{rightSummary.name || report.displayRightName || '-'}</p>
              <p className="text-xs text-gray-500">{t('analysisRows')}: {rightSummary.hits ?? rightRows.length}</p>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <BallSummaryLine label={t('analysisBestBall')} ball={rightBestBall} tone="positive" t={t} />
              <BallSummaryLine label={t('analysisWorstBall')} ball={rightWorstBall} tone="warning" t={t} />
              <SummaryMetricTile label={t('analysisAvgSpeed')} value={`${formatDecimal(rightSummary.avgSpeed, 1)} km/h`} />
              <SummaryMetricTile label={t('analysisMaxSpeed')} value={`${formatValue(rightSummary.maxSpeed || 0)} km/h`} />
              <SummaryMetricTile label={t('analysisDrops')} value={formatValue(rightDropCount)} />
              <SummaryMetricTile label={t('analysisBonusCount')} value={formatValue(rightBonusCount)} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <SummaryMetricTile label={t('totalScore')} value={formatValue(rightSummary.primaryTotal ?? rightSummary.totalPoints ?? 0)} tone="positive" />
              <SummaryMetricTile label={t('baseScore')} value={formatValue(rightPrimaryBaseTotal)} />
              <SummaryMetricTile label={t('analysisBonusAmount')} value={`+${formatValue(rightPrimaryBonusTotal)}`} tone={rightPrimaryBonusTotal > 0 ? 'warning' : 'neutral'} />
              <SummaryMetricTile label={t('analysisScoringBalls')} value={formatValue(rightPrimaryTop150Count)} />
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-[1.75rem] border border-[#2a2a4a] bg-[#16213e] p-4 shadow-lg shadow-black/20">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-gray-500">Partida</p>
            <p className="text-sm text-gray-400">{report.displayDate || '-'}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {scopeOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setScope(option.value)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  scope === option.value
                    ? 'border-[#0f9b8e]/40 bg-[#0f9b8e]/15 text-[#9ce8df]'
                    : 'border-white/10 bg-white/5 text-gray-300 hover:bg-white/10'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 text-xs text-gray-400">
          <span>{t('analysisRows')}: {visibleHitsCount}</span>
          <span>{t('analysisScoringBalls')}: {summary.duoScoringCount || rowsWithPrimary.filter((hit) => hit.primaryIsTop150).length || 0}</span>
        </div>

        <div className="mt-3 overflow-hidden rounded-2xl border border-[#2a2a4a] bg-[#0d0d1a]">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs font-mono">
              <thead className="bg-white/5 text-[10px] uppercase tracking-[0.18em] text-gray-500">
                <tr>
                  {timelineColumns.map(({ key, label }) => (
                    <th key={key} className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => handleSort(key)}
                        className="inline-flex w-full items-center justify-center gap-1 font-semibold text-gray-400 transition-colors hover:text-white"
                      >
                        <span>{label}</span>
                        <ArrowUpDown className="h-3.5 w-3.5" />
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleHits.map((hit, index) => {
                  const isDrop = Number(hit.speed) === 0 || dropSignatureSet.has(buildHitSignature(hit));
                  const responsiblePlayer = resolveTimelinePlayerLabel(hit, leftDropLabel, rightDropLabel);
                  return (
                    <tr
                      key={`${hit.sequence}-${hit.index}-${hit.rawTime}-${index}`}
                      className={`border-t border-white/5 ${
                        isDrop ? 'bg-amber-500/5' : ''
                      } ${hit.primaryBonusScore > 0 ? 'bg-amber-500/5' : ''} ${hit.primaryIsTop150 ? 'bg-emerald-500/5' : ''}`}
                    >
                      <td className="px-3 py-2 text-gray-300">{hit.elapsedLabel || '-'}</td>
                      <td className="px-3 py-2 text-center text-gray-200">{formatDirection(hit.direction)}</td>
                      <td className="px-3 py-2 text-gray-200">{responsiblePlayer || '-'}</td>
                      <td className={`px-3 py-2 text-center font-semibold ${isDrop ? 'text-amber-200' : 'text-white'}`}>
                        {formatTimelineSpeed(hit)}
                      </td>
                      <td className="px-3 py-2 text-center text-gray-300">{formatValue(hit.primaryBaseScore ?? 0)}</td>
                      <td className="px-3 py-2 text-center">
                        <span className={`inline-flex min-w-16 items-center justify-center rounded-full border px-2 py-1 text-[10px] font-black ${
                          hit.primaryBonusScore > 0
                            ? 'border-amber-500/30 bg-amber-500/15 text-amber-200'
                            : 'border-white/10 bg-white/5 text-gray-500'
                        }`}>
                          {formatBonusValue(hit.primaryBonusScore)}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-gray-400">
                        {(isDrop ? `${t('analysisResponsible')}: ${responsiblePlayer || '-'}` : hit.primaryBonusType || (hit.matchesContinuity
                          ? t('analysisVerdictContinuity')
                          : hit.matchesPower
                            ? t('analysisVerdictPower')
                            : hit.isSequenceMax
                              ? t('analysisVerdictMaxima')
                              : '-'))}
                      </td>
                      <td className="px-3 py-2 text-gray-100">
                        <span className="font-black">{formatValue(hit.primaryTotalScore ?? 0)}</span>
                      </td>
                      <td className="px-3 py-2 text-center">
                  <span className={`inline-flex items-center justify-center rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${
                                hit.primaryIsTop150
                                  ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-200'
                                  : 'border-white/10 bg-white/5 text-gray-500'
                              }`}>
                          {hit.primaryIsTop150 ? `#${String(hit.primaryTop150Rank || 0).padStart(2, '0')}` : '-'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function CsvAnalysisDetail({ report, csv, analysisData = null, t }) {
  const exportSource = analysisData || csv;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-gray-500">{t('analysisFile')}</p>
          <h3 className="mt-1 text-2xl font-black text-white">{report.fileName}</h3>
          <p className="mt-1 text-sm text-gray-400">{report.displayDate || '-'}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-[#0f9b8e]/30 bg-[#0d0d1a] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#0f9b8e]">
            {t('analysisFormatCsv')}
          </span>
          <AnalysisExportToolbar report={report} analysis={exportSource} t={t} />
        </div>
      </div>

      <div className="rounded-[1.75rem] border border-[#2a2a4a] bg-[#16213e] p-4 shadow-lg shadow-black/20">
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {csv.entries.map((entry) => (
            <div key={`${entry.index}-${entry.date}`} className="rounded-2xl border border-[#2a2a4a] bg-[#0d0d1a] p-3">
              <p className="text-xs uppercase tracking-[0.18em] text-gray-500">{entry.date || '-'}</p>
              <div className="mt-2 grid gap-3 lg:grid-cols-2">
                <div className="rounded-xl bg-white/5 p-2">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-gray-500">{t('analysisSideA')}</p>
                  <p className="mt-1 text-sm font-bold text-white">{formatValue(entry.leftName)}</p>
                  <p className="text-xs text-gray-400">
                    {formatValue(entry.leftScore)} pts · {formatValue(entry.leftHits)} hits · {formatValue(entry.leftAvgSpeed)} km/h
                  </p>
                </div>
                <div className="rounded-xl bg-white/5 p-2">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-gray-500">{t('analysisSideB')}</p>
                  <p className="mt-1 text-sm font-bold text-white">{formatValue(entry.rightName)}</p>
                  <p className="text-xs text-gray-400">
                    {formatValue(entry.rightScore)} pts · {formatValue(entry.rightHits)} hits · {formatValue(entry.rightAvgSpeed)} km/h
                  </p>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-400">
                <div className="rounded-xl bg-white/5 px-3 py-2">
                  <span className="block text-[10px] uppercase tracking-[0.18em] text-gray-500">{t('analysisField2')}</span>
                  <span className="font-semibold text-gray-200">{formatValue(entry.indicatorOne)}</span>
                </div>
                <div className="rounded-xl bg-white/5 px-3 py-2">
                  <span className="block text-[10px] uppercase tracking-[0.18em] text-gray-500">{t('analysisField3')}</span>
                  <span className="font-semibold text-gray-200">{formatValue(entry.indicatorTwo)}</span>
                </div>
              </div>
              <div className="mt-3 text-xs text-gray-500">
                <p>{t('analysisSummary')}: {formatValue(entry.totalPoints)} pts</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AnalysisDetails({ report, t }) {
  const analysis = resolveMatchAnalysis(report);
  if (!report || !analysis) return null;

  if (analysis.kind === 'match') {
    return <TxtTimelineDetail report={report} txt={analysis.txt || null} analysisData={analysis} t={t} />;
  }

  if (analysis.kind === 'txt') {
    return <TxtTimelineDetail report={report} txt={analysis} analysisData={analysis} t={t} />;
  }

  if (analysis.kind === 'csv') {
    return <CsvAnalysisDetail report={report} csv={analysis} analysisData={analysis} t={t} />;
  }

  return (
    <div className="rounded-[1.75rem] border border-[#2a2a4a] bg-[#16213e] p-5 text-center text-gray-300">
      <AlertTriangle className="mx-auto h-10 w-10 text-amber-300" />
      <p className="mt-3 text-sm font-semibold text-white">{report.fileName || t('analysisFile')}</p>
      <p className="mt-1 text-xs text-gray-500">{t('analysisUnsupportedFormat')}</p>
    </div>
  );
}

function ModalShell({ title, description, onClose, children, maxWidth = 'max-w-5xl' }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 px-4 py-6 backdrop-blur-sm">
      <div className={`relative w-full ${maxWidth} overflow-hidden rounded-[2rem] border border-[#2a2a4a] bg-[#16213e] shadow-2xl shadow-black/40`}>
        <div className="flex items-start justify-between gap-4 border-b border-white/5 px-5 py-4">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-gray-500">{title}</p>
            {description && <p className="mt-1 text-sm text-gray-400">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/10 bg-white/5 p-2 text-gray-200 transition-colors hover:bg-white/10"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[80vh] overflow-auto p-5">
          {children}
        </div>
      </div>
    </div>
  );
}

export default function Analysis() {
  const { isAdmin, isSpectator } = useAuth();
  const { t } = useI18n();
  const inputRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [savedNotice, setSavedNotice] = useState('');
  const [reports, setReports] = useState([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportsOpen, setReportsOpen] = useState(false);
  const [detailReport, setDetailReport] = useState(null);

  if (isSpectator) return <Navigate to={createPageUrl('SpectatorHub')} replace />;
  if (!isAdmin) return <Navigate to={createPageUrl('GameSetup')} replace />;

  const normalizedReports = useMemo(() => reports.map(normalizeAnalysisRecord), [reports]);

  useEffect(() => {
    if (!reportsOpen) return undefined;

    let cancelled = false;
    (async () => {
      setReportsLoading(true);
      try {
        const items = await listAnalysisReports('-updated_at', 200);
        if (!cancelled) setReports(items.filter(Boolean));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'analysis_reports_failed');
      } finally {
        if (!cancelled) setReportsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [reportsOpen]);

  const handlePickFiles = async (event) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    setLoading(true);
    setError('');
    setSavedNotice('');

    try {
      let lastUploadedDetail = null;
      for (const file of files) {
        const text = await file.text();
        const report = analyzeFrescogoReport(text, file.name);
        if (report.kind === 'unknown') {
          throw new Error(t('analysisUnsupportedFormat'));
        }

        const parsedReport = /** @type {any} */ (report);
        const matchKey = getFrescogoMatchKey(parsedReport);
        const existing = await getAnalysisReport(matchKey);
        const existingAnalysis = await loadStoredAnalysisData(existing);

        let csvReport = null;
        let txtReport = null;

        if (existingAnalysis?.kind === 'match') {
          csvReport = existingAnalysis.csv || null;
          txtReport = existingAnalysis.txt || null;
        } else if (existingAnalysis?.kind === 'csv') {
          csvReport = existingAnalysis;
        } else if (existingAnalysis?.kind === 'txt') {
          txtReport = existingAnalysis;
        }

        if (report.kind === 'csv') csvReport = report;
        if (report.kind === 'txt') txtReport = report;

        const combined = buildFrescogoCombinedAnalysis({
          csvReport,
          txtReport,
          existingAnalysis,
        });

        let rawUpload = null;
        try {
          rawUpload = await uploadAnalysisRawText(matchKey || combined.matchKey || file.name, text);
        } catch {
          rawUpload = null;
        }

        await createAnalysisReport({
          id: matchKey || undefined,
          match_key: matchKey,
          file_name: combined.txt?.fileName || combined.csv?.fileName || file.name,
          kind: combined.kind,
          display_date: combined.displayDate || parsedReport.displayDate || parsedReport.date || '',
          display_left_name: combined.displayLeftName || '',
          display_right_name: combined.displayRightName || '',
          display_score: combined.displayScore ?? parsedReport.displayScore ?? parsedReport.totalPoints ?? 0,
          raw_text_url: rawUpload?.raw_text_url || '',
          raw_text_size: rawUpload?.raw_text_size ?? getUtf8ByteLength(text),
          source_kind: parsedReport.kind,
          raw_text: text,
          analysis_data: combined,
        });

        lastUploadedDetail = hydrateAnalysisRecord({
          id: matchKey || undefined,
          match_key: matchKey,
          file_name: combined.txt?.fileName || combined.csv?.fileName || file.name,
          kind: combined.kind,
          display_date: combined.displayDate || parsedReport.displayDate || parsedReport.date || '',
          display_left_name: combined.displayLeftName || '',
          display_right_name: combined.displayRightName || '',
          display_score: combined.displayScore ?? parsedReport.displayScore ?? parsedReport.totalPoints ?? 0,
          raw_text_url: rawUpload?.raw_text_url || '',
          raw_text_size: rawUpload?.raw_text_size ?? getUtf8ByteLength(text),
          source_kind: parsedReport.kind,
          analysis_data: combined,
        });
      }

      setSavedNotice(files.length === 1 ? t('analysisSavedNotice') : t('analysisSavedNotice'));
      if (lastUploadedDetail) {
        setDetailReport(lastUploadedDetail);
      }
      if (reportsOpen) {
        const items = await listAnalysisReports('-updated_at', 200);
        setReports(items.filter(Boolean));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'analysis_failed');
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleDeleteReport = async (report) => {
    if (!report?.id) return;
    const ok = globalThis.confirm?.(t('analysisDeleteReportConfirm')) ?? true;
    if (!ok) return;
    try {
      await deleteAnalysisReport(report.id);
      const items = await listAnalysisReports('-updated_at', 200);
      setReports(items.filter(Boolean));
      if (detailReport?.id === report.id) {
        setDetailReport(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'analysis_delete_failed');
    }
  };

  const handleOpenReport = async (report) => {
    if (!report?.id) {
      setDetailReport(report);
      return;
    }

    try {
      const fullReport = await getAnalysisReport(report.id);
      const detail = await loadAnalysisReportDetail(fullReport || report);
      setDetailReport(detail || hydrateAnalysisRecord(fullReport || report));
    } catch {
      setDetailReport(report);
    }
  };

  return (
    <PageShell
      title={t('analysisTitle')}
      backTo={createPageUrl('AdminDashboard')}
      contentClassName="pt-4"
    >
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="rounded-[1.75rem] border border-[#2a2a4a] bg-[#16213e] p-5 shadow-lg shadow-black/20">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="max-w-2xl">
              <h2 className="mt-1 text-2xl font-black text-white">{t('analysisTitle')}</h2>
              <p className="mt-2 text-sm leading-relaxed text-gray-300">{t('analysisDesc')}</p>
              <p className="mt-2 text-xs text-gray-500">{t('analysisUploadHint')}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-full bg-[#0f9b8e] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#0d847a]"
              >
                <Upload className="h-4 w-4" />
                {t('analysisUpload')}
              </button>
              <button
                type="button"
                onClick={() => setReportsOpen(true)}
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-gray-200 transition-colors hover:bg-white/10"
              >
                <FileText className="h-4 w-4" />
                {t('analysisReportsButton')}
              </button>
              <input
                ref={inputRef}
                type="file"
                accept=".csv,.txt,text/csv,text/plain"
                multiple
                className="hidden"
                onChange={handlePickFiles}
              />
            </div>
          </div>

          {savedNotice && (
            <div className="mt-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
              {savedNotice}
            </div>
          )}

          {error && (
            <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          )}

          {loading && (
            <div className="mt-4 flex items-center gap-3 rounded-2xl border border-[#2a2a4a] bg-[#0d0d1a] px-4 py-3 text-sm text-gray-300">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#0f9b8e] border-t-transparent" />
              {t('loading')}
            </div>
          )}
        </div>

        {reportsOpen && (
          <ModalShell
            title={t('analysisReportsTitle')}
            description={t('analysisReportsHint')}
            onClose={() => setReportsOpen(false)}
            maxWidth="max-w-5xl"
          >
            <div className="space-y-3">
              {reportsLoading ? (
                <div className="flex items-center gap-3 rounded-2xl border border-[#2a2a4a] bg-[#0d0d1a] px-4 py-4 text-sm text-gray-300">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#0f9b8e] border-t-transparent" />
                  {t('loading')}
                </div>
              ) : normalizedReports.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[#3a3a5a] bg-[#0d0d1a] px-4 py-10 text-center">
                  <BarChart3 className="mx-auto h-10 w-10 text-[#0f9b8e]" />
                  <p className="mt-3 text-sm font-semibold text-white">{t('analysisStoredEmpty')}</p>
                  <p className="mt-1 text-xs text-gray-500">{t('analysisUploadHint')}</p>
                </div>
              ) : (
                normalizedReports.map((report) => (
                  <StoredReportCard
                    key={report.id}
                    report={report}
                    t={t}
                    onOpen={() => handleOpenReport(report)}
                    onDelete={() => handleDeleteReport(report)}
                  />
                ))
              )}
            </div>
          </ModalShell>
        )}

        {detailReport && (
          <ModalShell
            title={t('analysisSelectedReport')}
            description={formatValue(detailReport.fileName)}
            onClose={() => setDetailReport(null)}
            maxWidth="max-w-6xl"
          >
            <AnalysisDetails report={detailReport} t={t} />
          </ModalShell>
        )}
      </div>
    </PageShell>
  );
}



