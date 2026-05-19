import React, { useState } from 'react';
import { X, User, Download, FileText } from 'lucide-react';
import jsPDF from 'jspdf';
import { useI18n, getAppLanguage } from '@/lib/i18n';
import { buildAthleteScoreBreakdown } from '@/lib/scoring';

function fmt(t) {
  const mins = Math.floor(t / 60);
  const secs = t % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function formatBonusValue(bonusScore) {
  return bonusScore > 0 ? `+${bonusScore}` : '-';
}

function getDropResponsibleLabel(drop, leftName, rightName, t) {
  if (drop?.responsible_name) return drop.responsible_name;
  if (drop?.responsible_side === 'left') return leftName;
  if (drop?.responsible_side === 'right') return rightName;
  return t('unknown');
}

function normalizeBallDropEvents(ballDropEvents = [], leftName, rightName, t) {
  return (Array.isArray(ballDropEvents) ? ballDropEvents : []).map((drop, index) => ({
    ...drop,
    dropNumber: Number.isFinite(drop?.drop_number) ? drop.drop_number : index + 1,
    timeLabel: fmt(Number.isFinite(drop?.elapsed_seconds) ? drop.elapsed_seconds : 0),
    responsibleLabel: getDropResponsibleLabel(drop, leftName, rightName, t),
  }));
}

function generateCSV({ leftName, rightName, leftHits, rightHits, ballDropEvents, totalScore, ballDrops, freeBallDrops, calculateScore, continuityEnabled, powerEnabled, t }) {
  const leftBreakdown = buildAthleteScoreBreakdown(leftHits, calculateScore, { continuityEnabled, powerEnabled });
  const rightBreakdown = buildAthleteScoreBreakdown(rightHits, calculateScore, { continuityEnabled, powerEnabled });
  const dropEvents = normalizeBallDropEvents(ballDropEvents, leftName, rightName, t);

  const rows = [[t('player'), t('speedKmh'), t('timeMmSs'), t('baseScore'), t('bonusScore'), t('bonusType'), t('totalScore'), t('top150Ranking')]];

  [...leftBreakdown.entries].sort((a, b) => b.speed - a.speed).forEach((hit) => {
    rows.push([
      leftName,
      hit.speed.toFixed(2),
      fmt(hit.t),
      hit.baseScore,
      formatBonusValue(hit.bonusScore),
      hit.hasBonus ? hit.bonusType : '-',
      hit.totalScore,
      hit.isTop150 ? t('yes') : t('no'),
    ]);
  });

  [...rightBreakdown.entries].sort((a, b) => b.speed - a.speed).forEach((hit) => {
    rows.push([
      rightName,
      hit.speed.toFixed(2),
      fmt(hit.t),
      hit.baseScore,
      formatBonusValue(hit.bonusScore),
      hit.hasBonus ? hit.bonusType : '-',
      hit.totalScore,
      hit.isTop150 ? t('yes') : t('no'),
    ]);
  });

  rows.push([]);
  rows.push([t('totalScore'), totalScore]);
  rows.push([t('drops'), ballDrops]);
  const penaltyDrops = Math.max(0, ballDrops - freeBallDrops);
  const penalty = penaltyDrops > 0 ? `${(100 - Math.pow(0.97, penaltyDrops) * 100).toFixed(1)}%` : '0%';
  rows.push([t('dropDiscount'), penalty]);
  rows.push([]);
  rows.push([t('ballDropList'), t('timeMmSs'), t('responsible')]);
  dropEvents.forEach((drop) => {
    rows.push([`#${drop.dropNumber}`, drop.timeLabel, drop.responsibleLabel]);
  });

  const csv = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `report-${leftName}-${rightName}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

async function generatePDF({ leftName, rightName, leftPhoto, rightPhoto, leftHits, rightHits, ballDropEvents, totalScore, ballDrops, freeBallDrops = 5, calculateScore, continuityEnabled, powerEnabled, t }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210;
  const margin = 14;
  const col = (W - margin * 2) / 2;
  /** @type {[number, number, number]} */
  const teal = [15, 155, 142];
  /** @type {[number, number, number]} */
  const dark = [13, 13, 26];
  /** @type {[number, number, number]} */
  const mid = [22, 33, 62];

  async function loadImg(url) {
    if (!url) return null;
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        canvas.getContext('2d').drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/jpeg'));
      };
      img.onerror = () => resolve(null);
      img.src = url;
    });
  }

  const [leftImg, rightImg] = await Promise.all([loadImg(leftPhoto), loadImg(rightPhoto)]);
  const dropEvents = normalizeBallDropEvents(ballDropEvents, leftName, rightName, t);

  function drawHeader(title) {
    doc.setFillColor(...dark);
    doc.rect(0, 0, W, 297, 'F');
    doc.setFillColor(...teal);
    doc.rect(0, 0, W, 18, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text(title, W / 2, 12, { align: 'center' });
    doc.setTextColor(...teal);
    doc.setFontSize(7);
    doc.text(t('generatedAt', { date: new Date().toLocaleString(getAppLanguage()) }), W - margin, 16, { align: 'right' });
  }

  function drawAvatar(imgData, x, y, size) {
    doc.setFillColor(...mid);
    doc.circle(x + size / 2, y + size / 2, size / 2, 'F');
    if (imgData) doc.addImage(imgData, 'JPEG', x, y, size, size, '', 'FAST');
    else {
      doc.setTextColor(150, 150, 150);
      doc.setFontSize(14);
      doc.text('?', x + size / 2, y + size / 2 + 2, { align: 'center' });
    }
  }

  function drawPlayerPage(name, photo, hits) {
    const breakdown = buildAthleteScoreBreakdown(hits, calculateScore, { continuityEnabled, powerEnabled });
    const entries = breakdown.entries;
    const individualScore = breakdown.total;
    const top150Set = breakdown.top150IndexSet;
    const speeds = hits.map((h) => h.speed);
    const maxSpd = speeds.length ? Math.max(...speeds) : 0;
    const minSpd = speeds.length ? Math.min(...speeds) : 0;
    const total = hits.length;
    const quality = speeds.filter((s) => s >= 50).length;
    const discarded = total > 150 ? total - 150 : 0;
    const sortedByTime = [...entries].sort((a, b) => a.t - b.t);

    drawHeader(t('reportOf', { name }));
    drawAvatar(photo, margin, 24, 20);
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(name, margin + 24, 33);
    doc.setTextColor(...teal);
    doc.setFontSize(11);
    doc.text(`${individualScore.toLocaleString()} ${t('pts')}`, margin + 24, 40);

    let y = 52;
    const statW = col - 2;
    const statH = 14;
    /** @param {string} label @param {string} value @param {[number, number, number]} color @param {number} bx @param {number} by */
    const statBox = (label, value, color, bx, by) => {
      doc.setFillColor(...mid);
      doc.roundedRect(bx, by, statW, statH, 2, 2, 'F');
      doc.setTextColor(...color);
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.text(value, bx + statW / 2, by + 8, { align: 'center' });
      doc.setTextColor(130, 130, 150);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.text(label, bx + statW / 2, by + 12.5, { align: 'center' });
    };

    statBox(t('maxBall'), `${maxSpd.toFixed(1)} km/h`, [251, 191, 36], margin, y);
    statBox(t('minBall'), `${minSpd.toFixed(1)} km/h`, [96, 165, 250], margin + col, y);
    y += statH + 3;
    statBox(t('hits'), `${total}`, [196, 181, 253], margin, y);
    statBox(t('aboveMinSpeed', { speed: 50 }), `${quality} / 150`, [167, 139, 250], margin + col, y);
    y += statH + 3;

    doc.setFillColor(...mid);
    doc.roundedRect(margin, y, col * 2, statH, 2, 2, 'F');
    doc.setTextColor(...teal);
    doc.setFontSize(15);
    doc.setFont('helvetica', 'bold');
    doc.text(`${individualScore.toLocaleString()} ${t('individualPoints').toLowerCase()}`, W / 2, y + 9, { align: 'center' });
    y += statH + 5;

    if (discarded > 0) {
      doc.setTextColor(251, 146, 60);
      doc.setFontSize(7);
      doc.text(t('top150Discarded', { count: discarded }), margin, y + 4);
      y += 7;
    }

    doc.setFillColor(...teal);
    doc.rect(margin, y, col * 2, 7, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'bold');
    doc.text('#', margin + 3, y + 5);
    doc.text(t('timeMmSs'), margin + 12, y + 5);
    doc.text(t('speedKmh'), margin + 36, y + 5);
    doc.text(t('baseScore'), margin + 70, y + 5);
    doc.text(t('bonusScore'), margin + 92, y + 5);
    doc.text(t('bonusType'), margin + 120, y + 5);
    doc.text(t('totalScore'), margin + 158, y + 5);
    doc.text(t('top150Ranking'), margin + 185, y + 5);
    y += 8;

    sortedByTime.forEach((hit, i) => {
      if (y > 280) {
        doc.addPage();
        drawHeader(t('reportOfContinuation', { name }));
        y = 24;
      }
      const inTop = top150Set.has(hit.index);
      const score = hit.baseScore;
      const bonusScore = hit.bonusScore > 0 ? hit.bonusScore : 0;
      const bonusText = hit.hasBonus ? hit.bonusType : '-';
      doc.setFillColor(inTop ? 15 : 30, inTop ? 40 : 30, inTop ? 50 : 40);
      doc.rect(margin, y, col * 2, 5.5, 'F');
      doc.setTextColor(inTop ? 255 : 130, inTop ? 255 : 130, inTop ? 255 : 130);
      doc.setFontSize(6.5);
      doc.setFont('helvetica', inTop ? 'bold' : 'normal');
      doc.text(`${i + 1}`, margin + 3, y + 4);
      doc.text(fmt(hit.t), margin + 12, y + 4);
      doc.setTextColor(inTop ? 251 : 100, inTop ? 191 : 100, inTop ? 36 : 100);
      doc.text(`${hit.speed.toFixed(1)} km/h`, margin + 36, y + 4);
      doc.setTextColor(inTop ? 255 : 130, inTop ? 255 : 130, inTop ? 255 : 130);
      doc.text(`${score}`, margin + 70, y + 4);
      doc.setTextColor(bonusScore > 0 ? 201 : 130, bonusScore > 0 ? 162 : 130, bonusScore > 0 ? 39 : 130);
      doc.text(formatBonusValue(bonusScore), margin + 92, y + 4);
      doc.setTextColor(160, 160, 180);
      doc.text(bonusText, margin + 120, y + 4);
      doc.setTextColor(255, 255, 255);
      doc.text(`${hit.totalScore}`, margin + 158, y + 4);
      doc.setTextColor(inTop ? 15 : 130, inTop ? 155 : 130, inTop ? 142 : 130);
      doc.text(inTop ? 'top 150.' : '-', margin + 185, y + 4);
      y += 6;
    });
  }

  drawHeader(t('duoReport'));
  let y = 24;
  drawAvatar(leftImg, margin, y, 20);
  drawAvatar(rightImg, W - margin - 20, y, 20);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(`${leftName} & ${rightName}`, W / 2, y + 12, { align: 'center' });
  doc.setTextColor(...teal);
  doc.setFontSize(22);
  doc.text(totalScore.toLocaleString(), W / 2, y + 26, { align: 'center' });
  doc.setTextColor(150, 150, 170);
  doc.setFontSize(8);
  doc.text(t('totalPoints'), W / 2, y + 32, { align: 'center' });
  y += 40;

  const dStatW = (W - margin * 2 - 4) / 3;
  /** @param {string} label @param {string} value @param {[number, number, number]} color @param {number} bx */
  const duoBox = (label, value, color, bx) => {
    doc.setFillColor(...mid);
    doc.roundedRect(bx, y, dStatW, 14, 2, 2, 'F');
    doc.setTextColor(...color);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text(value, bx + dStatW / 2, y + 8, { align: 'center' });
    doc.setTextColor(130, 130, 150);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text(label, bx + dStatW / 2, y + 12.5, { align: 'center' });
  };
  duoBox(t('drops'), `${ballDrops}`, [248, 113, 113], margin);
  duoBox(t('hits'), `${leftHits.length + rightHits.length}`, [196, 181, 253], margin + dStatW + 2);
  const penaltyPct = ballDrops > freeBallDrops ? `-${(100 - Math.pow(0.97, ballDrops - freeBallDrops) * 100).toFixed(1)}%` : '-';
  duoBox(t('discount'), penaltyPct, ballDrops > freeBallDrops ? [248, 113, 113] : [130, 130, 150], margin + (dStatW + 2) * 2);
  y += 18;

  if (dropEvents.length > 0) {
    doc.setTextColor(220, 220, 235);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text(t('ballDropList'), margin, y + 3);
    y += 6;
    dropEvents.forEach((drop) => {
      if (y > 275) {
        doc.addPage();
        drawHeader(t('duoReportContinuation'));
        y = 24;
      }
      doc.setFillColor(...mid);
      doc.roundedRect(margin, y, W - margin * 2, 6, 2, 2, 'F');
      doc.setTextColor(180, 180, 200);
      doc.setFontSize(6.8);
      doc.setFont('helvetica', 'bold');
      doc.text(`#${drop.dropNumber}`, margin + 2, y + 4);
      doc.text(drop.timeLabel, margin + 16, y + 4);
      doc.text(t('responsible'), margin + 36, y + 4);
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'normal');
      doc.text(drop.responsibleLabel, margin + 58, y + 4);
      y += 7;
    });
    y += 2;
  }

  doc.setFillColor(...teal);
  doc.rect(margin, y, W - margin * 2, 7, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.text(t('timeline'), margin + 4, y + 5);
  doc.text(t('timeMmSs'), margin + 50, y + 5);
  doc.text(t('player'), margin + 80, y + 5);
  doc.text(t('speedKmh'), margin + 120, y + 5);
  y += 8;

  const allHits = [
    ...leftHits.map((h) => ({ ...h, side: 'left', name: leftName })),
    ...rightHits.map((h) => ({ ...h, side: 'right', name: rightName })),
  ].sort((a, b) => a.t - b.t);

  allHits.forEach((hit, i) => {
    if (y > 280) {
      doc.addPage();
      drawHeader(t('duoReportContinuation'));
      y = 24;
    }
    const isLeft = hit.side === 'left';
    doc.setFillColor(isLeft ? 15 : 30, isLeft ? 40 : 20, isLeft ? 45 : 50);
    doc.rect(margin, y, W - margin * 2, 5.5, 'F');
    doc.setFillColor(isLeft ? teal[0] : 167, isLeft ? teal[1] : 139, isLeft ? teal[2] : 250);
    doc.circle(margin + 3, y + 2.75, 1.5, 'F');
    doc.setTextColor(180, 180, 200);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text(`${i + 1}`, margin + 7, y + 4);
    doc.text(fmt(hit.t), margin + 50, y + 4);
    doc.text(hit.name, margin + 80, y + 4);
    doc.setTextColor(251, 191, 36);
    doc.text(`${hit.speed.toFixed(1)} km/h`, margin + 120, y + 4);
    y += 6;
  });

  doc.addPage();
  drawPlayerPage(leftName, leftImg, leftHits);
  doc.addPage();
  drawPlayerPage(rightName, rightImg, rightHits);
  doc.save(`report-${leftName}-${rightName}.pdf`);
}

function PlayerReport({ name, photo, hits, calculateScore, continuityEnabled, powerEnabled, t }) {
  const breakdown = buildAthleteScoreBreakdown(hits, calculateScore, { continuityEnabled, powerEnabled });
  const entries = breakdown.entries;
  const speeds = hits.map((h) => h.speed);
  const maxSpeed = speeds.length ? Math.max(...speeds) : 0;
  const minSpeed = speeds.length ? Math.min(...speeds) : 0;
  const total = hits.length;
  const quality = speeds.filter((s) => s >= 50).length;
  const individualScore = breakdown.total;
  const discarded = total > 150 ? total - 150 : 0;
  const top150Set = breakdown.top150IndexSet;
  const sortedBySpeed = [...entries].sort((a, b) => b.speed - a.speed);

  return (
    <div className="bg-[#16213e] rounded-2xl p-4 border border-[#2a2a4a]">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-14 h-14 rounded-full border-4 border-[#0f9b8e] overflow-hidden bg-[#0d0d1a] flex-shrink-0 flex items-center justify-center">
          {photo ? <img src={photo} alt={name} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-600 to-gray-800"><User className="w-7 h-7 text-gray-300" /></div>}
        </div>
        <div>
          <h3 className="text-lg font-bold text-white">{name}</h3>
          <span className="text-sm text-[#0f9b8e] font-semibold">{individualScore.toLocaleString()} {t('pts')}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-2">
        <div className="bg-[#0d0d1a] rounded-xl p-3 text-center">
          <p className="text-amber-400 font-bold text-xl">{maxSpeed.toFixed(1)}</p>
          <p className="text-gray-500 text-xs mt-0.5">{t('maxBall')}</p>
        </div>
        <div className="bg-[#0d0d1a] rounded-xl p-3 text-center">
          <p className="text-blue-400 font-bold text-xl">{minSpeed > 0 ? minSpeed.toFixed(1) : '-'}</p>
          <p className="text-gray-500 text-xs mt-0.5">{t('minBall')}</p>
        </div>
        <div className="bg-[#0d0d1a] rounded-xl p-3 text-center">
          <p className="text-white font-bold text-xl">{total}</p>
          <p className="text-gray-500 text-xs mt-0.5">{t('total')}</p>
        </div>
        <div className="bg-[#0d0d1a] rounded-xl p-3 text-center">
          <p className="text-purple-400 font-bold text-xl">{quality}<span className="text-sm text-gray-500">/150</span></p>
          <p className="text-gray-500 text-xs mt-0.5">{t('aboveMinSpeed', { speed: 50 })}</p>
        </div>
      </div>
      <div className="bg-[#0d0d1a] rounded-xl p-3 text-center mb-3">
        <p className="text-[#0f9b8e] font-bold text-2xl">{individualScore.toLocaleString()}</p>
        <p className="text-gray-500 text-xs">{t('individualPoints')}</p>
      </div>

      {discarded > 0 && <div className="bg-orange-900/20 border border-orange-700/50 rounded-xl p-2 mb-3 text-xs text-orange-300 text-center">{t('discardedHits', { count: discarded })}</div>}

      <div className="max-h-64 overflow-y-auto">
        <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">{t('speedRanking')}</p>
        <div className="min-w-[680px] space-y-1 overflow-x-auto">
          <div className="grid grid-cols-[28px_56px_84px_56px_72px_1fr_58px_48px] items-center rounded-lg bg-[#0f9b8e]/10 px-2 py-1 text-[10px] uppercase tracking-wide text-gray-400">
            <span>#</span>
            <span>{t('timeMmSs')}</span>
            <span>{t('speedKmh')}</span>
            <span>{t('baseScore')}</span>
            <span>{t('bonusScore')}</span>
            <span>{t('bonusType')}</span>
            <span>{t('totalScore')}</span>
            <span>{t('top150Ranking')}</span>
          </div>
          {sortedBySpeed.map((hit, i) => {
            const inTop = hit.isTop150;
            const bonusScore = hit.bonusScore > 0 ? hit.bonusScore : 0;
            return (
              <div
                key={i}
                className={`grid grid-cols-[28px_56px_84px_56px_72px_1fr_58px_48px] items-center rounded-lg px-2 py-1 text-xs ${
                  inTop ? 'bg-[#0f9b8e]/10 border border-[#0f9b8e]/30' : 'bg-[#0d0d1a] opacity-40'
                }`}
              >
                <span className={`font-bold ${inTop ? 'text-[#0f9b8e]' : 'text-gray-600'}`}>#{i + 1}</span>
                <span className="text-gray-400">{fmt(hit.t)}</span>
                <span className={`font-bold ${inTop ? 'text-white' : 'text-gray-500'}`}>{hit.speed.toFixed(1)} km/h</span>
                <span className={`${inTop ? 'text-white' : 'text-gray-500'}`}>{hit.baseScore}</span>
                <span className={`font-semibold ${bonusScore > 0 ? 'text-[#c9a227]' : 'text-gray-600'}`}>{formatBonusValue(bonusScore)}</span>
                <span className="truncate text-gray-500">{bonusScore > 0 ? hit.bonusType : '-'}</span>
                <span className="font-semibold text-white">{hit.totalScore}</span>
                <span className={`text-xs ${inTop ? 'text-[#0f9b8e]' : 'text-gray-600'}`}>{inTop ? 'top' : '-'}</span>
              </div>
            );
          })}
        </div>
        {hits.length === 0 && <p className="text-gray-600 text-center py-2">{t('noHits')}</p>}
      </div>
    </div>
  );
}

export default function MatchReport({ leftName, rightName, leftPhoto, rightPhoto, leftHits, rightHits, ballDropEvents = [], totalScore, ballDrops, freeBallDrops = 5, calculateScore, continuityEnabled = false, powerEnabled = false, matchStatus, visibility, duoName, onClose }) {
  const [downloading, setDownloading] = useState(false);
  const { t } = useI18n();
  const normalizedDropEvents = normalizeBallDropEvents(ballDropEvents, leftName, rightName, t);
  const allHits = [
    ...leftHits.map((h) => ({ ...h, side: 'left', name: leftName })),
    ...rightHits.map((h) => ({ ...h, side: 'right', name: rightName })),
  ].sort((a, b) => a.t - b.t);

  const handleDownload = async () => {
    setDownloading(true);
    await generatePDF({ leftName, rightName, leftPhoto, rightPhoto, leftHits, rightHits, ballDropEvents: normalizedDropEvents, totalScore, ballDrops, freeBallDrops, calculateScore, continuityEnabled, powerEnabled, t });
    setDownloading(false);
  };

  const handleCSV = () => generateCSV({ leftName, rightName, leftHits, rightHits, ballDropEvents: normalizedDropEvents, totalScore, ballDrops, freeBallDrops, calculateScore, continuityEnabled, powerEnabled, t });

  return (
    <div className="fixed inset-0 bg-black/85 z-50 overflow-y-auto">
      <div className="min-h-screen p-4 flex flex-col max-w-lg mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white">{t('reportTitle')}</h2>
          <div className="flex gap-2">
            <button onClick={handleCSV} className="flex items-center gap-2 px-4 py-2 rounded-full bg-[#2a2a4a] hover:bg-[#3a3a5a] text-white text-sm font-bold transition-colors"><FileText className="w-4 h-4" />CSV</button>
            <button onClick={handleDownload} disabled={downloading} className="flex items-center gap-2 px-4 py-2 rounded-full bg-[#0f9b8e] hover:bg-[#0d847a] text-white text-sm font-bold transition-colors disabled:opacity-60"><Download className="w-4 h-4" />{downloading ? t('generating') : 'PDF'}</button>
            <button onClick={onClose} className="p-2 rounded-full bg-[#2a2a4a] hover:bg-[#3a3a5a] transition-colors"><X className="w-5 h-5 text-gray-300" /></button>
          </div>
        </div>

        <div className="bg-[#16213e] rounded-2xl p-4 border border-[#2a2a4a] mb-4">
          <div className="flex items-center justify-center gap-4 mb-4">
            <div className="w-12 h-12 rounded-full border-4 border-[#0f9b8e] overflow-hidden bg-[#0d0d1a] flex-shrink-0 flex items-center justify-center">{leftPhoto ? <img src={leftPhoto} alt={leftName} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-600 to-gray-800"><User className="w-6 h-6 text-gray-300" /></div>}</div>
            <div className="text-center">
              <p className="text-xs text-gray-400">{leftName} & {rightName}</p>
              <p className="text-3xl font-bold text-white">{totalScore.toLocaleString()}</p>
              <p className="text-xs text-[#0f9b8e]">{t('totalPoints')}</p>
              {(duoName || matchStatus || visibility) && (
                <div className="mt-3 flex flex-wrap justify-center gap-2">
                  {duoName && <span className="rounded-full border border-[#2a2a4a] bg-[#0d0d1a] px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-gray-300">{duoName}</span>}
                  {matchStatus && <span className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-wide ${matchStatus === 'live' ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300' : 'border-slate-500/30 bg-slate-500/15 text-slate-300'}`}>{matchStatus === 'live' ? t('liveStatus') : t('finishedStatus')}</span>}
                  {visibility && <span className="rounded-full border border-[#2a2a4a] bg-[#0d0d1a] px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-gray-300">{visibility === 'public' ? t('publicGame') : t('privateGame')}</span>}
                </div>
              )}
            </div>
            <div className="w-12 h-12 rounded-full border-4 border-[#0f9b8e] overflow-hidden bg-[#0d0d1a] flex-shrink-0 flex items-center justify-center">{rightPhoto ? <img src={rightPhoto} alt={rightName} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-600 to-gray-800"><User className="w-6 h-6 text-gray-300" /></div>}</div>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center text-xs mb-3">
            <div className="bg-[#0d0d1a] rounded-xl p-2"><p className="text-white font-bold text-lg">{ballDrops}</p><p className="text-gray-500">{t('drops')}</p></div>
            <div className="bg-[#0d0d1a] rounded-xl p-2"><p className="text-white font-bold text-lg">{leftHits.length + rightHits.length}</p><p className="text-gray-500">{t('hits')}</p></div>
            <div className="bg-[#0d0d1a] rounded-xl p-2"><p className={`font-bold text-lg ${ballDrops > freeBallDrops ? 'text-red-400' : 'text-gray-500'}`}>{ballDrops > freeBallDrops ? `-${(100 - Math.pow(0.97, ballDrops - freeBallDrops) * 100).toFixed(1)}%` : '-'}</p><p className="text-gray-500">{t('discount')}</p></div>
          </div>

          <div className="max-h-36 overflow-y-auto space-y-1 mb-3">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">{t('ballDropList')}</p>
            {normalizedDropEvents.length === 0 ? (
              <p className="text-center text-gray-600 text-xs py-2">{t('noDropEvents')}</p>
            ) : (
              normalizedDropEvents.map((drop, i) => (
                <div key={`${drop.dropNumber}-${drop.timestampMs || i}`} className="flex items-center gap-2 text-xs bg-[#0d0d1a] rounded-lg px-3 py-1">
                  <span className="w-2 h-2 rounded-full flex-shrink-0 bg-[#c9a227]" />
                  <span className="text-gray-400 w-10">{drop.timeLabel}</span>
                  <span className="text-gray-300 flex-1">{`#${drop.dropNumber}`}</span>
                  <span className="font-bold text-white truncate">{drop.responsibleLabel}</span>
                </div>
              ))
            )}
          </div>

          <div className="max-h-36 overflow-y-auto space-y-1">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">{t('timeline')}</p>
            {allHits.map((hit, i) => <div key={i} className="flex items-center gap-2 text-xs bg-[#0d0d1a] rounded-lg px-3 py-1"><span className={`w-2 h-2 rounded-full flex-shrink-0 ${hit.side === 'left' ? 'bg-[#0f9b8e]' : 'bg-purple-400'}`} /><span className="text-gray-400 w-10">{fmt(hit.t)}</span><span className="text-gray-300 flex-1">{hit.name}</span><span className="font-bold text-white">{hit.speed.toFixed(1)} km/h</span></div>)}
          </div>
        </div>

        <div className="space-y-4">
          <PlayerReport name={leftName} photo={leftPhoto} hits={leftHits} calculateScore={calculateScore} continuityEnabled={continuityEnabled} powerEnabled={powerEnabled} t={t} />
          <PlayerReport name={rightName} photo={rightPhoto} hits={rightHits} calculateScore={calculateScore} continuityEnabled={continuityEnabled} powerEnabled={powerEnabled} t={t} />
        </div>

        <button onClick={onClose} className="mt-4 w-full bg-[#2a2a4a] hover:bg-[#3a3a5a] text-white font-bold py-3 rounded-full transition-colors">{t('close')}</button>
      </div>
    </div>
  );
}
