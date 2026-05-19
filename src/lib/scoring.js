const CONTINUITY_BREAK_MS = 1500;
const INTENSITY_BLOCK_SIZE = 10;
const POWER_INCREASE_RATIO = 1.2;
const POWER_BONUS_LIMIT = 25;

export function getScoringModeDefaults(scoringMode = 'option_1') {
  const isRule2 = scoringMode === 'option_2';
  return {
    balance_enabled: true,
    continuity_enabled: isRule2,
    power_enabled: isRule2,
  };
}

export function resolveScoringConfiguration(scoringMode = 'option_1', minScoringSpeed = 50, overrides = {}) {
  const mode = scoringMode === 'option_2' ? 'option_2' : 'option_1';
  const defaults = getScoringModeDefaults(mode);
  return {
    scoringMode: mode,
    minScoringSpeed: Number.isFinite(minScoringSpeed) ? minScoringSpeed : 50,
    balanceEnabled: overrides.balanceEnabled ?? defaults.balance_enabled,
    continuityEnabled: overrides.continuityEnabled ?? defaults.continuity_enabled,
    powerEnabled: overrides.powerEnabled ?? defaults.power_enabled,
  };
}

export function createSpeedScoreCalculator(scoringMode = 'option_1', minScoringSpeed = 50) {
  const mode = scoringMode === 'option_2' ? 'option_2' : 'option_1';
  const threshold = Number.isFinite(minScoringSpeed) ? minScoringSpeed : 50;
  return (speedKmh = 0) => {
    if (speedKmh <= 0 || speedKmh < threshold) return 0;
    if (mode === 'option_2') return calculateFrescobolRule2Score(speedKmh);
    return calculateFrescobolRule1Score(speedKmh);
  };
}

export function applyBalanceRule(leftScore, rightScore, enabled) {
  if (!enabled) {
    return { left: leftScore, right: rightScore };
  }

  if (leftScore >= rightScore) {
    return {
      left: Math.min(leftScore, rightScore * 1.3),
      right: rightScore,
    };
  }

  return {
    left: leftScore,
    right: Math.min(rightScore, leftScore * 1.3),
  };
}

export function calculateFrescobolRule1Score(speedKmh = 0) {
  if (!Number.isFinite(speedKmh) || speedKmh < 50) return 0;
  return Math.floor((speedKmh * speedKmh) / 50);
}

export function calculateFrescobolRule2Score(speedKmh = 0) {
  if (!Number.isFinite(speedKmh) || speedKmh < 50) return 0;
  return Math.floor((speedKmh * (50 + speedKmh)) / 100);
}

function getHitTimeMs(hit, fallbackIndex = 0) {
  if (Number.isFinite(hit?.timestampMs)) return hit.timestampMs;
  if (Number.isFinite(hit?.elapsedMs)) return hit.elapsedMs;
  if (Number.isFinite(hit?.t)) return hit.t * 1000;
  return fallbackIndex * 1000;
}

function addBonus(bonusMap, index, reason) {
  const current = bonusMap.get(index) || { reasons: [] };
  const reasons = current.reasons.includes(reason) ? current.reasons : [...current.reasons, reason];
  bonusMap.set(index, { reasons });
}

function formatBonusReasons(reasons = []) {
  return reasons
    .map((reason) => (reason === 'power' ? 'Potência (*)' : 'Continuidade (+)'))
    .join(' + ');
}

function splitSequencesByTime(hitEntries = []) {
  const sequences = [];
  let startIndex = 0;

  for (let i = 1; i <= hitEntries.length; i += 1) {
    const isBreak =
      i === hitEntries.length ||
      (hitEntries[i].timestampMs - hitEntries[i - 1].timestampMs) > CONTINUITY_BREAK_MS;

    if (!isBreak) continue;

    sequences.push(hitEntries.slice(startIndex, i));
    startIndex = i;
  }

  return sequences;
}

export function buildAthleteScoreBreakdown(
  hits,
  calculateScore,
  {
    continuityEnabled = false,
    powerEnabled = false,
  } = {},
) {
  if (!Array.isArray(hits) || hits.length === 0) {
    return {
      entries: [],
      total: 0,
      top150IndexSet: new Set(),
    };
  }

  const hitEntries = hits.map((hit, index) => ({
    ...hit,
    index,
    timestampMs: getHitTimeMs(hit, index),
  }));

  const rankedTop150 = [...hitEntries]
    .sort((a, b) => b.speed - a.speed || a.timestampMs - b.timestampMs || a.index - b.index)
    .slice(0, 150);
  const top150IndexSet = new Set(rankedTop150.map((hit) => hit.index));
  const bonusMap = new Map();

  if (continuityEnabled) {
    const sequences = splitSequencesByTime(hitEntries);

    sequences.forEach((sequence) => {
      const blockCount = Math.floor(sequence.length / INTENSITY_BLOCK_SIZE);

      for (let blockIndex = 0; blockIndex < blockCount; blockIndex += 1) {
        const block = sequence.slice(
          blockIndex * INTENSITY_BLOCK_SIZE,
          blockIndex * INTENSITY_BLOCK_SIZE + INTENSITY_BLOCK_SIZE,
        );
        const selectedHit = [...block]
          .sort((a, b) => b.speed - a.speed || a.timestampMs - b.timestampMs || a.index - b.index)
          .at(Math.floor(INTENSITY_BLOCK_SIZE / 2));

        if (selectedHit) {
          addBonus(bonusMap, selectedHit.index, 'continuity');
        }
      }
    });
  }

  if (powerEnabled) {
    const potentCandidates = [];

    for (let i = 1; i < hitEntries.length; i += 1) {
      const previous = hitEntries[i - 1].speed;
      const current = hitEntries[i].speed;
      if (previous > 0 && current >= previous * POWER_INCREASE_RATIO) {
        potentCandidates.push(hitEntries[i]);
      }
    }

    const topPowerCandidates = potentCandidates
      .sort((a, b) => b.speed - a.speed || a.timestampMs - b.timestampMs || a.index - b.index)
      .slice(0, POWER_BONUS_LIMIT);

    topPowerCandidates.forEach((hit) => addBonus(bonusMap, hit.index, 'power'));
  }

  const entries = hitEntries.map((hit) => {
    const baseScore = calculateScore(hit.speed);
    const isTop150 = top150IndexSet.has(hit.index);
    const bonusMeta = bonusMap.get(hit.index);
    const bonusCount = isTop150 ? (bonusMeta?.reasons?.length || 0) : 0;
    const bonusScore = isTop150 ? baseScore * bonusCount : 0;
    const totalScore = isTop150 ? baseScore * (1 + bonusCount) : 0;
    const bonusType = isTop150 ? formatBonusReasons(bonusMeta?.reasons || []) : '';

    return {
      ...hit,
      baseScore,
      bonusScore,
      totalScore,
      bonusType,
      bonusMultiplier: 1 + bonusCount,
      bonusCount,
      hasBonus: isTop150 && bonusCount > 0,
      isTop150,
    };
  });

  const total = entries.reduce((sum, entry) => sum + entry.totalScore, 0);

  return {
    entries,
    total,
    top150IndexSet,
  };
}

export function computeAthleteScore(hits, calculateScore, options) {
  return buildAthleteScoreBreakdown(hits, calculateScore, options).total;
}
