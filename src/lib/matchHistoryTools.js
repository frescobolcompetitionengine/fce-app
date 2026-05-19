import jsPDF from 'jspdf';
import { buildAthleteScoreBreakdown, createSpeedScoreCalculator } from '@/lib/scoring';
import { formatMatchDateTime } from '@/lib/matchPresentation';

export function getMatchScoreCalculator(match) {
  return createSpeedScoreCalculator(match?.scoring_mode || 'option_1', match?.min_scoring_speed ?? 50);
}

export function getTop150(hits) {
  return [...hits].sort((a, b) => a.speed - b.speed).slice(-150);
}

export function fmtSeconds(t) {
  const mins = Math.floor(t / 60);
  const secs = t % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function buildDemoHits(startMs, speeds, spacingMs = 160) {
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

export function buildDemoMatch(user, t) {
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
  const calculateScore = createSpeedScoreCalculator('option_2', 50);
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
    duo_name: 'Demo de BÃ´nus',
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

export function exportMatchCSV(match, t) {
  const calc = getMatchScoreCalculator(match);
  const leftHits = match.left_hits || [];
  const rightHits = match.right_hits || [];
  const ballDropEvents = Array.isArray(match.ball_drop_events) ? match.ball_drop_events : [];
  const freeBallDrops = match.free_ball_drops ?? 5;
  const leftTop = new Set(getTop150(leftHits).map((h) => `${h.speed.toFixed(4)}_${h.t}`));
  const rightTop = new Set(getTop150(rightHits).map((h) => `${h.speed.toFixed(4)}_${h.t}`));
  const rows = [[t('player'), t('speedKmh'), t('timeMmSs'), t('points'), t('top150Ranking')]];

  [...leftHits].sort((a, b) => b.speed - a.speed).forEach((hit) => {
    const key = `${hit.speed.toFixed(4)}_${hit.t}`;
    rows.push([match.left_name, hit.speed.toFixed(2), fmtSeconds(hit.t), calc(hit.speed), leftTop.has(key) ? t('yes') : t('no')]);
  });
  [...rightHits].sort((a, b) => b.speed - a.speed).forEach((hit) => {
    const key = `${hit.speed.toFixed(4)}_${hit.t}`;
    rows.push([match.right_name, hit.speed.toFixed(2), fmtSeconds(hit.t), calc(hit.speed), rightTop.has(key) ? t('yes') : t('no')]);
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
    rows.push([`#${Number.isFinite(drop?.drop_number) ? drop.drop_number : index + 1}`, fmtSeconds(Number.isFinite(drop?.elapsed_seconds) ? drop.elapsed_seconds : 0), responsible || t('unknown')]);
  });
  return rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
}

export function exportMatchesCSV(matches, t, language) {
  const rows = [[t('date'), t('hour'), t('leftPlayerShort'), t('rightPlayerShort'), t('totalScoreLabel'), t('drops'), t('hits')]];
  matches.forEach((match) => {
    const { date, time } = formatMatchDateTime(match.played_at, language);
    rows.push([date, time, match.left_name, match.right_name, match.total_score, match.ball_drops ?? 0, (match.left_hits?.length ?? 0) + (match.right_hits?.length ?? 0)]);
  });
  return rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
}

export function exportMatchesPDF(matches, t, language) {
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
    const { date, time } = formatMatchDateTime(match.played_at, language);
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
  return doc;
}
