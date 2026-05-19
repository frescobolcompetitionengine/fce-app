import React from 'react';
import { motion } from 'framer-motion';

function BallDropButton({ count, onPress, disabled }) {
  return (
    <motion.button
      whileTap={{ scale: 0.9 }}
      onClick={onPress}
      disabled={disabled}
      className="
        w-20 h-20
        rounded-full
        bg-gradient-to-br from-[#1e3a8a] to-[#1d4ed8]
        shadow-xl shadow-blue-700/50
        flex flex-col items-center justify-center
        text-white font-bold
        disabled:opacity-50 disabled:cursor-not-allowed
        active:from-[#1e40af] active:to-[#2563eb]
        transition-all duration-150
        border-4 border-[#60a5fa]
        z-50
      "
    >
      <svg viewBox="0 0 40 40" className="w-8 h-8" fill="none">
        <circle cx="20" cy="20" r="18" fill="#facc15" />
        <circle cx="14" cy="13" r="5" fill="#fef08a" opacity="0.6" />
      </svg>
      <span className="text-xs font-bold tabular-nums leading-none">{count}</span>
    </motion.button>
  );
}

export default React.memo(BallDropButton);
