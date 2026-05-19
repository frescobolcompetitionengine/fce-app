import {
  buildAthleteScoreBreakdown,
  calculateFrescobolRule1Score,
  calculateFrescobolRule2Score,
} from '@/lib/scoring';

const FCE_POWER_RATIO = 1.2;

function normalizeText(text = '') {
  return String(text).replace(/\uFEFF/g, '').trim();
}

function normalizeKeyPart(value = '') {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function buildMatchKey(date = '', leftName = '', rightName = '') {
  return [date, leftName, rightName]
    .map(normalizeKeyPart)
    .filter(Boolean)
    .join('|');
}

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function mean(values = []) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stdDev(values = []) {
  if (!Array.isArray(values) || values.length < 2) return 0;
  const average = mean(values);
  const variance = values.reduce((sum, value) => sum + ((value - average) ** 2), 0) / values.length;
  return Math.sqrt(variance);
}

function formatDateFromToken(token = '') {
  const value = String(token || '').trim();
  if (!value) return '';
  const match = value.match(/^(\d{4})[_-](\d{2})[_-](\d{2})(?:[_-](\d{2})[_-](\d{2})[_-](\d{2}))?$/);
  if (!match) return value;
  const [, year, month, day, hour = '', minute = '', second = ''] = match;
  if (!hour) return `${year}-${month}-${day}`;
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

function parseNamesFromFileName(fileName = '') {
  const clean = String(fileName).replace(/\.[^.]+$/, '');
  const match = clean.match(/^frescogo-(\d{4}_\d{2}_\d{2}_\d{2}_\d{2}_\d{2})-(.+?)-(.+)$/i);
  if (!match) return { fileDate: '', leftName: '', rightName: '' };
  return {
    fileDate: match[1].replace(/_/g, '-'),
    leftName: match[2].trim(),
    rightName: match[3].trim(),
  };
}

function getHitSpeedLabel(speed = 0) {
  return `${safeNumber(speed, 0)} km/h`;
}

function resolveResponsiblePlayerLabel(side, displayLeftName, displayRightName) {
  if (side === 'left') return displayLeftName || 'Jogador 1';
  if (side === 'right') return displayRightName || 'Jogador 2';
  return 'Desconhecido';
}

function resolveHitSide(hit = {}) {
  if (!hit) return 'unknown';
  if (hit.side === 'left' || hit.side === 'right') return hit.side;
  if (hit.direction === '->') return 'left';
  if (hit.direction === '<-') return 'right';
  return 'unknown';
}

export function parseFrescogoTime(rawTime = '') {
  const digits = String(rawTime).replace(/\D/g, '');
  if (!digits) return 0;
  const minutes = Number(digits.slice(0, -5) || '0');
  const seconds = Number(digits.slice(-5, -3) || '0');
  const millis = Number(digits.slice(-3) || '0');
  return (minutes * 60) + seconds + (millis / 1000);
}

export function formatFrescogoTime(seconds = 0) {
  const total = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const minutes = Math.floor(total / 60);
  const wholeSeconds = Math.floor(total % 60);
  const millis = Math.round((total - Math.floor(total)) * 1000);
  return `${minutes}:${String(wholeSeconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

function computeRuleBreakdown(hits, calculateScore) {
  return buildAthleteScoreBreakdown(hits, calculateScore, {
    continuityEnabled: true,
    powerEnabled: true,
  });
}

function getRuleLabel(rule = 'rule1') {
  return rule === 'rule1' ? 'Regra 1' : 'Regra 2';
}

function pickPrimaryRuleData(hit, primaryRule = 'rule1') {
  const ruleData = hit?.[primaryRule] || null;
  return {
    rule: primaryRule,
    label: getRuleLabel(primaryRule),
    baseScore: safeNumber(ruleData?.baseScore, 0),
    bonusScore: safeNumber(ruleData?.bonusScore, 0),
    totalScore: safeNumber(ruleData?.totalScore, 0),
    bonusType: ruleData?.bonusType || '',
    bonusMultiplier: safeNumber(ruleData?.bonusMultiplier, 1),
    hasBonus: Boolean(ruleData?.hasBonus),
    isTop150: Boolean(ruleData?.isTop150),
  };
}

function buildPrimaryHitView(hit, primaryRule = 'rule1', displayLeftName = '', displayRightName = '') {
  const primary = pickPrimaryRuleData(hit, primaryRule);
  const playerName = hit.side === 'left' ? displayLeftName : displayRightName;
  return {
    ...hit,
    playerName,
    primaryRule: primary.rule,
    primaryRuleLabel: primary.label,
    primaryBaseScore: primary.baseScore,
    primaryBonusScore: primary.bonusScore,
    primaryTotalScore: primary.totalScore,
    primaryBonusType: primary.bonusType,
    primaryBonusMultiplier: primary.bonusMultiplier,
    primaryHasBonus: primary.hasBonus,
    primaryIsTop150: primary.isTop150,
  };
}

function buildPlayerScoreSummary({
  hits = [],
  displayName = '',
  primaryRule = 'rule1',
  rule1Breakdown = null,
  rule2Breakdown = null,
}) {
  const scoringHits = hits
    .filter((hit) => hit.primaryIsTop150)
    .map((hit) => buildPrimaryHitView(hit, primaryRule, displayName, displayName))
    .sort((a, b) => a.index - b.index);

  const scoringHitsByPoints = [...scoringHits].sort(
    (a, b) => b.primaryTotalScore - a.primaryTotalScore || b.speed - a.speed || a.index - b.index,
  );

  const bestBall = scoringHitsByPoints[0] || null;
  const worstBall = scoringHitsByPoints[scoringHitsByPoints.length - 1] || null;

  return {
    name: displayName,
    hits: hits.length,
    avgSpeed: mean(hits.map((hit) => hit.speed)),
    maxSpeed: hits.length ? Math.max(...hits.map((hit) => hit.speed)) : 0,
    minSpeed: hits.length ? Math.min(...hits.map((hit) => hit.speed)) : 0,
    drops: 0,
    bonusCount: scoringHits.filter((hit) => hit.primaryHasBonus).length,
    plusCount: hits.filter((hit) => hit.hasPlus).length,
    rule1Total: rule1Breakdown?.total || 0,
    rule2Total: rule2Breakdown?.total || 0,
    baseRule1Total: rule1Breakdown?.entries?.reduce((sum, entry) => sum + safeNumber(entry.baseScore, 0), 0) || 0,
    baseRule2Total: rule2Breakdown?.entries?.reduce((sum, entry) => sum + safeNumber(entry.baseScore, 0), 0) || 0,
    primaryRule,
    primaryRuleLabel: getRuleLabel(primaryRule),
    primaryTotal: primaryRule === 'rule1'
      ? (rule1Breakdown?.total || 0)
      : (rule2Breakdown?.total || 0),
    primaryHits: scoringHits,
    primaryHitsByScore: scoringHitsByPoints,
    scoringCount: scoringHits.length,
    bestBall,
    worstBall,
  };
}

function addSequenceTag(sequence, index) {
  if (!Number.isFinite(sequence)) return index;
  return `${String(sequence).padStart(2, '0')}-${String(index).padStart(3, '0')}`;
}

function buildRallySummary({
  sequence,
  seqHits,
  displayLeftName,
  displayRightName,
  primaryRule = 'rule1',
}) {
  const firstHit = seqHits[0] || null;
  const lastHit = seqHits[seqHits.length - 1] || null;
  const responsibleHit = resolveHitSide(lastHit) !== 'unknown'
    ? lastHit
    : [...seqHits].reverse().find((hit) => resolveHitSide(hit) !== 'unknown') || null;
  const speeds = seqHits.map((hit) => hit.speed);
  const rule1Total = seqHits.reduce((sum, hit) => sum + safeNumber(hit.rule1?.totalScore, 0), 0);
  const rule2Total = seqHits.reduce((sum, hit) => sum + safeNumber(hit.rule2?.totalScore, 0), 0);
  const primaryTotal = seqHits.reduce((sum, hit) => sum + safeNumber(hit[primaryRule]?.totalScore, 0), 0);
  const bonusHits = seqHits.filter((hit) => hit.fceBonus?.hasBonus || hit.hasPlus);
  const plusHits = seqHits.filter((hit) => hit.hasPlus);
  const maximaHits = seqHits.filter((hit) => hit.isSequenceMax);
  const continuityHits = seqHits.filter((hit) => hit.matchesContinuity);
  const powerHits = seqHits.filter((hit) => hit.matchesPower);
  const responsibleSide = resolveHitSide(responsibleHit);
  const responsiblePlayer = resolveResponsiblePlayerLabel(responsibleSide, displayLeftName, displayRightName);
  const dropEvent = {
    sequence,
    responsibleSide,
    responsiblePlayer,
    timeMs: safeNumber(responsibleHit?.timestampMs, 0),
    timeLabel: formatFrescogoTime(Math.max(0, safeNumber(responsibleHit?.timestampMs, 0) / 1000)),
    speed: safeNumber(responsibleHit?.speed, 0),
  };

  const rallyType = plusHits.length > 0
    ? 'plus'
    : continuityHits.length > powerHits.length
      ? 'continuity'
      : powerHits.length > continuityHits.length
        ? 'power'
        : maximaHits.length > 0
          ? 'maxima'
          : 'neutral';

  return {
    sequence,
    key: addSequenceTag(sequence, firstHit?.index ?? 0),
    totalHits: seqHits.length,
    startTimeMs: safeNumber(firstHit?.timestampMs, 0),
    endTimeMs: safeNumber(lastHit?.timestampMs, 0),
    durationMs: Math.max(0, safeNumber(lastHit?.timestampMs, 0) - safeNumber(firstHit?.timestampMs, 0)),
    durationLabel: formatFrescogoTime(Math.max(0, (safeNumber(lastHit?.timestampMs, 0) - safeNumber(firstHit?.timestampMs, 0)) / 1000)),
    responsibleSide,
    responsiblePlayer,
    dropSpeed: safeNumber(responsibleHit?.speed, 0),
    firstSpeed: safeNumber(firstHit?.speed, 0),
    maxSpeed: speeds.length ? Math.max(...speeds) : 0,
    minSpeed: speeds.length ? Math.min(...speeds) : 0,
    avgSpeed: mean(speeds),
    stdDevSpeed: stdDev(speeds),
    rule1Total,
    rule2Total,
    primaryTotal,
    primaryRule,
    primaryRuleLabel: getRuleLabel(primaryRule),
    plusCount: plusHits.length,
    bonusCount: bonusHits.length,
    maximaCount: maximaHits.length,
    continuityCount: continuityHits.length,
    powerCount: powerHits.length,
    rallyType,
    hits: seqHits,
    dropEvent,
  };
}

function buildMatchInsights({
  rallies,
  summary,
  comparison,
  displayLeftName,
  displayRightName,
}) {
  const sortedByRule2 = [...rallies].sort((a, b) => b.rule2Total - a.rule2Total);
  const sortedByRule1 = [...rallies].sort((a, b) => b.rule1Total - a.rule1Total);
  const sortedByDuration = [...rallies].sort((a, b) => b.durationMs - a.durationMs);
  const sortedByConstancy = [...rallies]
    .filter((rally) => rally.totalHits >= 8)
    .sort((a, b) => a.stdDevSpeed - b.stdDevSpeed || b.avgSpeed - a.avgSpeed);
  const sortedBySpeed = [...rallies].sort((a, b) => b.avgSpeed - a.avgSpeed || b.maxSpeed - a.maxSpeed);
  const sortedByBurst = [...rallies].sort((a, b) => b.maxSpeed - a.maxSpeed || b.avgSpeed - a.avgSpeed);
  const sortedByBonus = [...rallies].sort((a, b) => b.plusCount - a.plusCount || b.bonusCount - a.bonusCount);
  const sortedByShort = [...rallies].sort((a, b) => a.totalHits - b.totalHits || a.rule2Total - b.rule2Total);

  const bestRule = comparison.bestFitRule;
  const bestRuleLabel = bestRule === 'rule1' ? 'Regra 1' : 'Regra 2';

  const selectedTop = bestRule === 'rule1' ? sortedByRule1[0] : sortedByRule2[0];
  const strongest = sortedByBurst[0] || null;
  const mostConstant = sortedByConstancy[0] || null;
  const mostConsistent = sortedBySpeed[0] || null;
  const longest = sortedByDuration[0] || null;
  const mostBonusRich = sortedByBonus[0] || null;
  const worstRally = sortedByShort[0] || null;

  const dropCountLeft = rallies.filter((rally) => rally.responsibleSide === 'left').length;
  const dropCountRight = rallies.filter((rally) => rally.responsibleSide === 'right').length;
  const dropWinner = dropCountLeft > dropCountRight
    ? displayLeftName
    : dropCountRight > dropCountLeft
      ? displayRightName
      : '';

  const plusCount = summary.plusCount || 0;
  const maxPlusCount = summary.maximaCount || 0;
  const continuityPlusCount = summary.continuityCount || 0;
  const powerPlusCount = summary.powerCount || 0;

  const lines = [
    `A pontuação da dupla exportada pelo FrescoGO foi ${summary.reportedTotal} pontos.`,
    `A fórmula do FCE mais próxima da pontuação da dupla foi a ${bestRuleLabel}.`,
    selectedTop
      ? `O rally mais produtivo foi a sequência ${String(selectedTop.sequence).padStart(2, '0')}, com ${selectedTop.totalHits} batidas e ${bestRule === 'rule1' ? selectedTop.rule1Total : selectedTop.rule2Total} pontos pela ${bestRuleLabel}${selectedTop.plusCount ? `, incluindo ${selectedTop.plusCount} marcador(es) +` : ''}.`
      : '',
    strongest
      ? `O rally mais forte em velocidade média foi a sequência ${String(strongest.sequence).padStart(2, '0')}, com média de ${strongest.avgSpeed.toFixed(1)} km/h e pico de ${strongest.maxSpeed} km/h.`
      : '',
    mostConstant
      ? `O rally mais constante foi a sequência ${String(mostConstant.sequence).padStart(2, '0')}, com menor dispersão de velocidades (${mostConstant.stdDevSpeed.toFixed(2)} km/h).`
      : '',
    longest
      ? `O rally mais longo foi a sequência ${String(longest.sequence).padStart(2, '0')}, com ${longest.totalHits} batidas e duração de ${longest.durationLabel}.`
      : '',
    mostBonusRich
      ? `A sequência ${String(mostBonusRich.sequence).padStart(2, '0')} concentrou mais marcadores + (${mostBonusRich.plusCount}).`
      : '',
    `Dos ${plusCount} marcadores +, ${maxPlusCount} coincidem com máximas do rally, ${continuityPlusCount} apontam para continuidade e ${powerPlusCount} para aceleração/potência.`,
    dropWinner
      ? `As quedas ficaram mais associadas ao lado ${dropWinner === displayLeftName ? 'esquerdo' : 'direito'} (${dropCountLeft} vs ${dropCountRight}).`
      : `As quedas ficaram equilibradas entre os dois lados (${dropCountLeft} vs ${dropCountRight}).`,
    worstRally
      ? `A sequência ${String(worstRally.sequence).padStart(2, '0')} foi a menos produtiva, com ${worstRally.totalHits} batidas e ${bestRule === 'rule1' ? worstRally.rule1Total : worstRally.rule2Total} pontos pela ${bestRuleLabel}.`
      : '',
    mostConsistent
      ? `A sequência mais intensa em ritmo médio foi a ${String(mostConsistent.sequence).padStart(2, '0')}, com média de ${mostConsistent.avgSpeed.toFixed(1)} km/h.`
      : '',
  ].filter(Boolean);

  return {
    bestRule,
    bestRuleLabel,
    selectedTop,
    strongest,
    mostConstant,
    mostConsistent,
    longest,
    mostBonusRich,
    worstRally,
    dropCountLeft,
    dropCountRight,
    dropWinner,
    lines,
  };
}

function parseCsvReport(text) {
  const rows = normalizeText(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(';').map((part) => part.trim()))
    .filter((fields) => fields.length >= 2);

  const entries = rows.map((fields, index) => ({
    index,
    fields,
    raw: fields.join(' ; '),
    date: fields[0] || '',
    totalPoints: Number(fields[1] || 0),
    indicatorOne: fields[2] || '',
    indicatorTwo: fields[3] || '',
    leftName: fields[4] || '',
    leftScore: Number(fields[5] || 0),
    leftHits: Number(fields[6] || 0),
    leftAvgSpeed: Number(fields[7] || 0),
    rightName: fields[8] || '',
    rightScore: Number(fields[9] || 0),
    rightHits: Number(fields[10] || 0),
    rightAvgSpeed: Number(fields[11] || 0),
  }));

  const firstEntry = entries[0] || {
    date: '',
    leftName: '',
    rightName: '',
    totalPoints: 0,
  };

  const displayDate = formatDateFromToken(firstEntry.date || '');
  const matchKey = buildMatchKey(firstEntry.date || '', firstEntry.leftName || '', firstEntry.rightName || '');

  return {
    kind: 'csv',
    title: 'CSV',
    matchKey,
    entries,
    displayDate,
    displayLeftName: firstEntry.leftName || '',
    displayRightName: firstEntry.rightName || '',
    displayScore: firstEntry.totalPoints || 0,
    totalPoints: firstEntry.totalPoints || 0,
    summary: {
      totalPoints: firstEntry.totalPoints || 0,
      rows: entries.length,
    },
  };
}

function findCsvEntryForMatch(csvReport = null, matchKey = '') {
  if (!csvReport || !Array.isArray(csvReport.entries) || csvReport.entries.length === 0) return null;
  if (!matchKey) return csvReport.entries[0] || null;
  const normalizedMatchKey = normalizeKeyPart(matchKey);
  return csvReport.entries.find((entry) => buildMatchKey(entry.date || '', entry.leftName || '', entry.rightName || '') === normalizedMatchKey) || csvReport.entries[0] || null;
}

function parseTxtReport(text, fileName = '') {
  const lines = normalizeText(text).split(/\r?\n/);
  let currentSequence = null;
  const hits = [];
  const sequences = [];
  let date = '';
  let version = '';
  let totalPoints = 0;

  lines.forEach((line, index) => {
    const dateMatch = line.match(/^Data:\s*(.+)$/i);
    if (dateMatch) {
      date = dateMatch[1].trim();
      return;
    }

    const versionMatch = line.match(/^Vers/i);
    if (versionMatch) {
      version = line.split(':').slice(1).join(':').trim();
      return;
    }

    const totalMatch = line.match(/^Total:\s*([0-9]+)\s*pontos/i);
    if (totalMatch) {
      totalPoints = Number(totalMatch[1] || 0);
      return;
    }

    if (/^SEQU/i.test(line)) {
      const seqMatch = line.match(/(\d{2})/);
      currentSequence = seqMatch ? Number(seqMatch[1]) : currentSequence;
      return;
    }

    const hitMatch = line.match(/^(\d{6})\s+(->|<-)\s+(\d{3})\s*(\+)?\s*$/);
    if (hitMatch) {
      const rawTime = hitMatch[1];
      const direction = hitMatch[2];
      const speed = Number(hitMatch[3]);
      const hasPlus = Boolean(hitMatch[4]);
      const elapsedSeconds = parseFrescogoTime(rawTime);
      hits.push({
        index: hits.length,
        lineNumber: index + 1,
        sequence: currentSequence,
        rawTime,
        elapsedSeconds,
        timestampMs: elapsedSeconds * 1000,
        elapsedLabel: formatFrescogoTime(elapsedSeconds),
        direction,
        speed,
        hasPlus,
      });
    }
  });

  const fileMeta = parseNamesFromFileName(fileName);
  const displayLeftName = fileMeta.leftName || '';
  const displayRightName = fileMeta.rightName || '';
  const displayDate = formatDateFromToken(fileMeta.fileDate || date);
  const matchKey = buildMatchKey(fileMeta.fileDate || date, displayLeftName, displayRightName);

  const sequencesMap = new Map();
  hits.forEach((hit) => {
    if (!sequencesMap.has(hit.sequence)) sequencesMap.set(hit.sequence, []);
    sequencesMap.get(hit.sequence).push(hit);
  });

  const leftHits = [];
  const rightHits = [];
  const sideHits = hits.map((hit) => {
    const side = hit.direction === '->' ? 'left' : 'right';
    const sideIndex = side === 'left' ? leftHits.length : rightHits.length;
    const sideHit = {
      ...hit,
      side,
      sideIndex,
    };
    if (side === 'left') leftHits.push(sideHit);
    else rightHits.push(sideHit);
    return sideHit;
  });

  const rule1Left = computeRuleBreakdown(leftHits, calculateFrescobolRule1Score);
  const rule1Right = computeRuleBreakdown(rightHits, calculateFrescobolRule1Score);
  const rule2Left = computeRuleBreakdown(leftHits, calculateFrescobolRule2Score);
  const rule2Right = computeRuleBreakdown(rightHits, calculateFrescobolRule2Score);

  const rule1Map = new Map();
  const rule2Map = new Map();
  rule1Left.entries.forEach((entry) => rule1Map.set(`left-${entry.index}`, entry));
  rule1Right.entries.forEach((entry) => rule1Map.set(`right-${entry.index}`, entry));
  rule2Left.entries.forEach((entry) => rule2Map.set(`left-${entry.index}`, entry));
  rule2Right.entries.forEach((entry) => rule2Map.set(`right-${entry.index}`, entry));

  sideHits.forEach((hit) => {
    const sideKey = `${hit.side}-${hit.sideIndex}`;
    const rule1 = rule1Map.get(sideKey) || null;
    const rule2 = rule2Map.get(sideKey) || null;
    hit.rule1 = rule1;
    hit.rule2 = rule2;
    hit.fceBonus = rule1?.hasBonus ? rule1 : rule2?.hasBonus ? rule2 : null;
    hit.fceBonusType = hit.fceBonus?.bonusType || '';
    hit.hasFceBonus = Boolean(hit.fceBonus?.hasBonus);
  });

  const sequenceStats = [...sequencesMap.entries()].map(([sequence, seqHits]) => {
    const maxSpeed = seqHits.reduce((max, hit) => Math.max(max, hit.speed), 0);
    const plusHits = seqHits.filter((hit) => hit.hasPlus);
    const continuityBlocks = [];
    const blockCount = Math.floor(seqHits.length / 10);

    for (let block = 0; block < blockCount; block += 1) {
      const chunk = seqHits.slice(block * 10, block * 10 + 10);
      const fifthStrongest = [...chunk].sort((a, b) => b.speed - a.speed)[4];
      if (fifthStrongest) {
        continuityBlocks.push(fifthStrongest.index);
      }
    }

    const powerHits = plusHits.filter((hit) => {
      const sideArray = hit.side === 'left' ? leftHits : rightHits;
      const sidePos = sideArray.findIndex((candidate) => candidate.index === hit.index);
      const previous = sidePos > 0 ? sideArray[sidePos - 1] : null;
      return Boolean(previous) && previous.speed > 0 && hit.speed >= previous.speed * FCE_POWER_RATIO;
    });

    const maxHits = plusHits.filter((hit) => hit.speed === maxSpeed);
    const continuityHits = plusHits.filter((hit) => continuityBlocks.includes(hit.index));
    const fceBonusHits = plusHits.filter((hit) => hit.hasFceBonus);

    let verdict = 'unknown';
    if (maxHits.length === plusHits.length && plusHits.length > 0) verdict = 'maxima';
    else if (continuityHits.length >= powerHits.length && continuityHits.length > 0) verdict = 'continuity';
    else if (powerHits.length > continuityHits.length && powerHits.length > 0) verdict = 'power';
    else if (fceBonusHits.length > 0) verdict = 'mixed';

    return {
      sequence,
      totalHits: seqHits.length,
      maxSpeed,
      plusHits,
      maxHits,
      continuityHits,
      powerHits,
      fceBonusHits,
      verdict,
    };
  }).sort((a, b) => a.sequence - b.sequence);

  const sequenceStatsMap = new Map(sequenceStats.map((entry) => [entry.sequence, entry]));

  const plusHits = sideHits.filter((hit) => hit.hasPlus);
  const maximaHits = plusHits.filter((hit) => sequenceStatsMap.get(hit.sequence)?.maxHits.some((maxHit) => maxHit.index === hit.index));
  const continuityHits = plusHits.filter((hit) => sequenceStatsMap.get(hit.sequence)?.continuityHits.some((candidate) => candidate.index === hit.index));
  const powerHits = plusHits.filter((hit) => sequenceStatsMap.get(hit.sequence)?.powerHits.some((candidate) => candidate.index === hit.index));
  const fceBonusHits = plusHits.filter((hit) => hit.hasFceBonus);

  const knownHits = new Set([
    ...maximaHits.map((hit) => hit.index),
    ...continuityHits.map((hit) => hit.index),
    ...powerHits.map((hit) => hit.index),
  ]);

  const unknownHits = plusHits.filter((hit) => !knownHits.has(hit.index));

  sideHits.forEach((hit) => {
    const sequenceStat = sequenceStatsMap.get(hit.sequence);
    hit.sequenceMax = sequenceStat?.maxSpeed || 0;
    hit.isSequenceMax = sequenceStat?.maxHits.some((candidate) => candidate.index === hit.index) || false;
    hit.matchesContinuity = sequenceStat?.continuityHits.some((candidate) => candidate.index === hit.index) || false;
    hit.matchesPower = sequenceStat?.powerHits.some((candidate) => candidate.index === hit.index) || false;
    hit.sequenceVerdict = sequenceStat?.verdict || 'unknown';
    hit.plusLabel = hit.hasPlus ? '+' : '';
  });

  let rallies = [...sequencesMap.entries()].map(([sequence, seqHits]) => buildRallySummary({
    sequence,
    seqHits,
    displayLeftName,
    displayRightName,
  }));

  const comparison = {
    reportedTotal: totalPoints,
    rule1Total: rule1Left.total + rule1Right.total,
    rule2Total: rule2Left.total + rule2Right.total,
    rule1Difference: Math.abs(totalPoints - (rule1Left.total + rule1Right.total)),
    rule2Difference: Math.abs(totalPoints - (rule2Left.total + rule2Right.total)),
  };
  comparison.bestFitRule = comparison.rule1Difference <= comparison.rule2Difference ? 'rule1' : 'rule2';
  comparison.bestFitLabel = comparison.bestFitRule === 'rule1' ? 'Regra 1' : 'Regra 2';

  const primaryRule = comparison.bestFitRule;
  const primaryRuleLabel = comparison.bestFitLabel;

  sideHits.forEach((hit) => {
    const primary = pickPrimaryRuleData(hit, primaryRule);
    hit.primaryRule = primaryRule;
    hit.primaryRuleLabel = primaryRuleLabel;
    hit.primaryBaseScore = primary.baseScore;
    hit.primaryBonusScore = primary.bonusScore;
    hit.primaryTotalScore = primary.totalScore;
    hit.primaryBonusType = primary.bonusType;
    hit.primaryBonusMultiplier = primary.bonusMultiplier;
    hit.primaryHasBonus = primary.hasBonus;
    hit.primaryIsTop150 = primary.isTop150;
  });

  rallies = rallies.map((rally) => ({
    ...rally,
    primaryRule,
    primaryRuleLabel,
    primaryTotal: rally.hits.reduce((sum, hit) => sum + safeNumber(hit[primaryRule]?.totalScore, 0), 0),
  }));
  const dropEvents = rallies.map((rally) => rally.dropEvent).filter(Boolean);

  const leftPlayerSummary = buildPlayerScoreSummary({
    hits: leftHits,
    displayName: displayLeftName,
    primaryRule,
    rule1Breakdown: rule1Left,
    rule2Breakdown: rule2Left,
  });
  const rightPlayerSummary = buildPlayerScoreSummary({
    hits: rightHits,
    displayName: displayRightName,
    primaryRule,
    rule1Breakdown: rule1Right,
    rule2Breakdown: rule2Right,
  });

  leftPlayerSummary.drops = dropEvents.filter((drop) => drop.responsibleSide === 'left').length;
  rightPlayerSummary.drops = dropEvents.filter((drop) => drop.responsibleSide === 'right').length;

  const duoScoringHits = [
    ...leftPlayerSummary.primaryHits,
    ...rightPlayerSummary.primaryHits,
  ].sort((a, b) => a.timestampMs - b.timestampMs || a.index - b.index);

  const summary = {
    totalHits: hits.length,
    plusCount: plusHits.length,
    maximaCount: maximaHits.length,
    continuityCount: continuityHits.length,
    powerCount: powerHits.length,
    fceBonusCount: fceBonusHits.length,
    unknownCount: unknownHits.length,
    overallVerdict:
      maximaHits.length > 0 && maximaHits.length === plusHits.length
        ? 'maxima'
        : continuityHits.length >= powerHits.length && continuityHits.length > 0
          ? 'continuity'
          : powerHits.length > continuityHits.length && powerHits.length > 0
            ? 'power'
            : fceBonusHits.length > 0
              ? 'mixed'
              : 'unknown',
    reportedTotal: totalPoints,
    rule1Total: comparison.rule1Total,
    rule2Total: comparison.rule2Total,
    bestFitRule: comparison.bestFitRule,
    bestFitLabel: comparison.bestFitLabel,
    rule1Difference: comparison.rule1Difference,
    rule2Difference: comparison.rule2Difference,
    primaryRule,
    primaryRuleLabel,
    primaryTotal: comparison.bestFitRule === 'rule1' ? comparison.rule1Total : comparison.rule2Total,
    primaryDifference: comparison.bestFitRule === 'rule1' ? comparison.rule1Difference : comparison.rule2Difference,
    sequenceCount: rallies.length,
    leftHits: leftHits.length,
    rightHits: rightHits.length,
    leftDrops: leftPlayerSummary.drops,
    rightDrops: rightPlayerSummary.drops,
    duoScoringCount: duoScoringHits.length,
    dropEvents,
  };

  const insights = buildMatchInsights({
    rallies,
    summary,
    comparison,
    displayLeftName,
    displayRightName,
  });

  return {
    kind: 'txt',
    title: 'TXT',
    matchKey,
    date,
    version,
    totalPoints,
    displayDate,
    displayLeftName,
    displayRightName,
    displayScore: totalPoints,
    hits,
    sideHits,
    sequences: sequenceStats,
    rallies,
    comparison,
    playerSummary: {
      left: leftPlayerSummary,
      right: rightPlayerSummary,
    },
    summary,
    insights,
    duoScoringHits,
    rows: sideHits,
    sourceFileName: fileName,
    fileName,
  };
}

export function buildFrescogoCombinedAnalysis({
  csvReport = null,
  txtReport = null,
  existingAnalysis = null,
} = {}) {
  const existing = existingAnalysis || {};
  const csv = csvReport || existing.csv || null;
  const txt = txtReport || existing.txt || null;
  const primary = txt || csv || existing.txt || existing.csv || null;
  const matchedCsvEntry = findCsvEntryForMatch(csv, txt?.matchKey || existing.matchKey || csv?.matchKey || '');

  const matchKey = txt?.matchKey || buildMatchKey(matchedCsvEntry?.date || csv?.entries?.[0]?.date || '', matchedCsvEntry?.leftName || csv?.displayLeftName || '', matchedCsvEntry?.rightName || csv?.displayRightName || '') || existing.matchKey || '';
  const displayDate = txt?.displayDate || matchedCsvEntry?.date || csv?.displayDate || existing.displayDate || '';
  const displayLeftName = txt?.displayLeftName || matchedCsvEntry?.leftName || csv?.displayLeftName || existing.displayLeftName || '';
  const displayRightName = txt?.displayRightName || matchedCsvEntry?.rightName || csv?.displayRightName || existing.displayRightName || '';
  const displayScore = txt?.displayScore ?? matchedCsvEntry?.totalPoints ?? csv?.displayScore ?? existing.displayScore ?? 0;

  return {
    kind: 'match',
    title: 'MATCH',
    matchKey,
    displayDate,
    displayLeftName,
    displayRightName,
    displayScore,
    csv,
    txt,
    sourceFiles: [
      csv ? { kind: 'csv', fileName: csv.fileName || csv.sourceFileName || '' } : null,
      txt ? { kind: 'txt', fileName: txt.fileName || txt.sourceFileName || '' } : null,
    ].filter(Boolean),
    reportedTotal: txt?.totalPoints ?? matchedCsvEntry?.totalPoints ?? csv?.totalPoints ?? existing.reportedTotal ?? 0,
    comparison: txt?.comparison || existing.comparison || null,
    primaryRule: txt?.comparison?.bestFitRule || existing.primaryRule || 'rule1',
    primaryRuleLabel: txt?.comparison?.bestFitLabel || existing.primaryRuleLabel || 'Regra 1',
    primaryScore: txt?.summary?.primaryTotal ?? existing.primaryScore ?? 0,
    primaryDifference: txt?.summary?.primaryDifference ?? existing.primaryDifference ?? 0,
    playerSummary: txt?.playerSummary || existing.playerSummary || null,
    rallies: txt?.rallies || existing.rallies || [],
    sequences: txt?.sequences || existing.sequences || [],
    insights: txt?.insights || existing.insights || [],
    duoScoringHits: txt?.duoScoringHits || existing.duoScoringHits || [],
    summary: txt?.summary || existing.summary || null,
    primaryKind: txt ? 'txt' : 'csv',
    primary,
  };
}

export function analyzeFrescogoReport(text, fileName = '') {
  const normalized = normalizeText(text);
  if (!normalized) {
    return {
      kind: 'unknown',
      title: fileName || 'report',
      error: 'empty',
    };
  }

  if (normalized.includes('SEQU') || normalized.includes('TEMPO   DIR')) {
    return {
      ...parseTxtReport(normalized, fileName),
      fileName,
      sourceFileName: fileName,
    };
  }

  if (normalized.includes(';')) {
    return {
      ...parseCsvReport(normalized),
      fileName,
      sourceFileName: fileName,
    };
  }

  return {
    kind: 'unknown',
    title: fileName || 'report',
    fileName,
    sourceFileName: fileName,
    error: 'unsupported',
  };
}

export function getFrescogoMatchKey(report = null) {
  if (!report) return '';
  if (report.matchKey) return report.matchKey;
  if (report.kind === 'txt') return buildMatchKey(report.date || report.displayDate || '', report.displayLeftName || '', report.displayRightName || '');
  if (report.kind === 'csv') return buildMatchKey(report.entries?.[0]?.date || report.displayDate || '', report.displayLeftName || '', report.displayRightName || '');
  return buildMatchKey(report.displayDate || '', report.displayLeftName || '', report.displayRightName || '');
}

export function buildFrescogoReportLabel(report = null) {
  if (!report) return '';
  const date = report.displayDate || report.date || '';
  const left = report.displayLeftName || report.leftName || '';
  const right = report.displayRightName || report.rightName || '';
  const score = safeNumber(report.displayScore ?? report.totalPoints ?? 0, 0);
  return `${date} · ${left} vs ${right} · ${score}`;
}
