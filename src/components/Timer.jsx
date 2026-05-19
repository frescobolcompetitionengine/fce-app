import React from 'react';
import { Flame, Pause, Play, RotateCcw } from 'lucide-react';

function Timer({
  timeLeft,
  isRunning,
  onToggle,
  onReset,
  onWarmupToggle,
  warmupActive = false,
  toggleDisabled = false,
  showControls = true,
}) {
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="bg-[#0d0d1a] rounded-2xl px-6 py-3 border border-[#2a2a4a] shadow-lg">
        <span className="text-4xl font-bold text-white tracking-wider font-mono">
          {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
        </span>
      </div>
      {showControls && (
        <div className="flex gap-2">
          <button
            onClick={onToggle}
            disabled={toggleDisabled}
            className={`p-1.5 rounded-full transition-colors ${
              toggleDisabled
                ? 'bg-[#2a2a4a] text-gray-500 cursor-not-allowed'
                : isRunning
                ? 'bg-[#e94560] hover:bg-[#c73e54]'
                : 'bg-[#0f9b8e] hover:bg-[#0d847a]'
            }`}
          >
            {isRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
          </button>
          <button
            onClick={onReset}
            className="p-1.5 rounded-full bg-[#2a2a4a] hover:bg-[#3a3a5a] transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          {onWarmupToggle && (
            <button
              onClick={onWarmupToggle}
              className={`p-1.5 rounded-full transition-colors ${
                warmupActive
                  ? 'bg-amber-500 hover:bg-amber-400 text-[#0d0d1a]'
                  : 'bg-amber-900/60 hover:bg-amber-800 text-amber-100'
              }`}
              title="Aquecimento"
            >
              <Flame className="w-4 h-4" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default React.memo(Timer);
