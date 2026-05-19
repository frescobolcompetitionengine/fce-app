import React from 'react';
import { motion } from 'framer-motion';
import { Ban } from 'lucide-react';

export default function InterruptionButton({ count, onPress, disabled }) {
  return (
    <motion.button
      whileTap={{ scale: 0.9 }}
      onClick={onPress}
      disabled={disabled}
      className="
        w-20 h-20
        rounded-full
        bg-gradient-to-br from-[#e94560] to-[#c73e54]
        shadow-xl shadow-[#e94560]/50
        flex flex-col items-center justify-center
        text-white font-bold
        disabled:opacity-50 disabled:cursor-not-allowed
        active:from-[#c73e54] active:to-[#a33347]
        transition-all duration-150
        border-4 border-[#ff6b85]
      "
    >
      <span className="text-4xl font-bold tabular-nums">{count}</span>
    </motion.button>
  );
}