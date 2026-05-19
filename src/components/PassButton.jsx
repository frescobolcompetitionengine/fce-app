import React from 'react';
import { motion } from 'framer-motion';

/**
 * @typedef {Object} PassButtonLabels
 * @property {string} [left]
 * @property {string} [right]
 */

/**
 * @typedef {Object} PassButtonProps
 * @property {'left' | 'right'} side
 * @property {() => void} onPress
 * @property {boolean} disabled
 * @property {number} lastSpeed
 * @property {PassButtonLabels} [labels]
 */

/** @param {PassButtonProps} props */
function PassButton({ side, onPress, disabled, lastSpeed, labels = {} }) {
  const isLeft = side === 'left';
  const leftLabel = labels.left || 'LEFT';
  const rightLabel = labels.right || 'RIGHT';

  return (
    <motion.button
      whileTap={{ scale: 0.95 }}
      onClick={onPress}
      disabled={disabled}
      className={`
        fixed bottom-4 ${isLeft ? 'left-4' : 'right-4'}
        w-20 h-20
        rounded-full
        bg-gradient-to-br from-[#e94560] to-[#c73e54]
        shadow-xl shadow-[#e94560]/40
        flex flex-col items-center justify-center
        text-white font-bold
        disabled:opacity-50 disabled:cursor-not-allowed
        active:from-[#c73e54] active:to-[#a33347]
        transition-all duration-150
        border-4 border-[#ff6b85]
        z-50
      `}
    >
      <span className="text-xs uppercase tracking-wider opacity-90 font-bold">
        {isLeft ? leftLabel : rightLabel}
      </span>
      {lastSpeed > 0 && (
        <span className="text-lg font-mono mt-0.5 font-bold">
          {lastSpeed.toFixed(0)}
        </span>
      )}
    </motion.button>
  );
}

export default React.memo(PassButton);
