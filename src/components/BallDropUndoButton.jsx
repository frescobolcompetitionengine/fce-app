import React from 'react';
import { motion } from 'framer-motion';
import { Minus } from 'lucide-react';

function BallDropUndoButton({ onPress, disabled }) {
  return (
    <motion.button
      whileTap={{ scale: 0.9 }}
      onClick={onPress}
      disabled={disabled}
      className="
        w-20 h-20
        rounded-full
        bg-gradient-to-br from-[#374151] to-[#4b5563]
        shadow-xl shadow-gray-700/50
        flex flex-col items-center justify-center
        text-white font-bold
        disabled:opacity-30 disabled:cursor-not-allowed
        active:from-[#4b5563] active:to-[#6b7280]
        transition-all duration-150
        border-4 border-[#9ca3af]
        z-50
      "
    >
      <svg viewBox="0 0 40 40" className="w-7 h-7 mb-0.5" fill="none">
        <circle cx="20" cy="20" r="18" fill="#facc15" />
        <circle cx="14" cy="13" r="5" fill="#fef08a" opacity="0.6" />
      </svg>
      <Minus className="w-4 h-4 -mt-1 text-red-300" />
    </motion.button>
  );
}

export default React.memo(BallDropUndoButton);
