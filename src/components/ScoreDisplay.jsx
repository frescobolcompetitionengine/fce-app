import React from 'react';
import { Timer, Trophy } from 'lucide-react';

/**
 * @typedef {Object} ScoreDisplayLabels
 * @property {string} [score]
 * @property {string} [passes]
 */

/**
 * @typedef {Object} ScoreDisplayProps
 * @property {number} score
 * @property {number} elapsedPasses
 * @property {ScoreDisplayLabels} [labels]
 */

/** @param {ScoreDisplayProps} props */
function ScoreDisplay({ score, elapsedPasses, labels = {} }) {
  const scoreLabel = labels.score || 'Score';
  const passesLabel = labels.passes || 'passes';

  return (
    <div className="bg-[#0d0d1a] rounded-2xl px-4 py-3 border border-[#e94560]/40 flex flex-col items-center gap-1 shadow-lg shadow-[#e94560]/10 min-w-[120px]">
      <div className="flex items-center gap-1.5 text-gray-400">
        <Trophy className="w-4 h-4 text-[#e94560]" />
        <span className="text-xs uppercase tracking-wider font-semibold">{scoreLabel}</span>
      </div>
      <span className="font-bold text-white tracking-tight leading-none" style={{ fontSize: 'clamp(3rem, 13vw, 7rem)' }}>
        {String(score)}
      </span>
      <div className="flex items-center gap-1 text-gray-500">
        <Timer className="w-3 h-3" />
        <span className="text-xs font-medium">{elapsedPasses} {passesLabel}</span>
      </div>
    </div>
  );
}

export default React.memo(ScoreDisplay);
