import React from 'react';
import { motion } from 'framer-motion';
import { Pause, Play } from 'lucide-react';

function PauseButton({ isRunning, onToggle, disabled = false }) {
  return (
    <motion.button
      whileTap={{ scale: 0.95 }}
      onClick={onToggle}
      disabled={disabled}
      className={`
        w-20 h-20
        rounded-full
        bg-gradient-to-br from-[#f59e0b] to-[#f97316]
        shadow-xl shadow-[#f97316]/40
        flex flex-col items-center justify-center
        text-white font-bold
        disabled:opacity-40 disabled:cursor-not-allowed
        active:from-[#d97706] active:to-[#ea6c0a]
        transition-all duration-150
        border-4 border-[#fbbf24]
        z-50
      `}
    >
      {isRunning ? (
        <Pause className="w-8 h-8" />
      ) : (
        <Play className="w-8 h-8 ml-1" />
      )}
    </motion.button>
  );
}

export default React.memo(PauseButton);
