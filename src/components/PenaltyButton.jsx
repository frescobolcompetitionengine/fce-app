import React from 'react';
import { motion } from 'framer-motion';
import { Minus } from 'lucide-react';

export default function PenaltyButton({ onPress, disabled }) {
  return (
    <motion.button
      whileTap={{ scale: 0.9 }}
      onClick={onPress}
      disabled={disabled}
      className="
        w-16 h-16
        rounded-full
        bg-gradient-to-br from-orange-500 to-orange-600
        shadow-lg shadow-orange-500/40
        flex items-center justify-center
        text-white font-bold
        disabled:opacity-50 disabled:cursor-not-allowed
        active:from-orange-600 active:to-orange-700
        transition-all duration-150
        border-4 border-orange-400
      "
    >
      <Minus className="w-6 h-6" />
    </motion.button>
  );
}