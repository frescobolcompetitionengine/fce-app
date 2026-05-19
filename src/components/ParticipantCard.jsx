import React from 'react';
import { Radar, Star, User } from 'lucide-react';

function getQualityColor(qualityPasses) {
  if (qualityPasses >= 150) return { num: '#22c55e', slash150: '#22c55e' };
  if (qualityPasses >= 100) return { num: '#eab308', slash150: '#eab308' };
  if (qualityPasses >= 50) return { num: '#f97316', slash150: '#f97316' };
  return { num: '#ef4444', slash150: '#ef4444' };
}

/**
 * @typedef {Object} ParticipantCardLabels
 * @property {string} [max]
 * @property {string} [min]
 * @property {string} [total]
 * @property {string} [minSpeedTag]
 * @property {string} [pts]
 */

/**
 * @typedef {Object} ParticipantCardProps
 * @property {string} name
 * @property {string} photoUrl
 * @property {number} currentSpeed
 * @property {number} maxSpeed
 * @property {number} minSpeed
 * @property {number} qualityPasses
 * @property {number} totalPasses
 * @property {number} individualScore
 * @property {'left' | 'right'} [side]
 * @property {boolean} [showRadar]
 * @property {ParticipantCardLabels} [labels]
 */

/** @param {ParticipantCardProps} props */
function ParticipantCard({
  name,
  photoUrl,
  currentSpeed,
  maxSpeed,
  minSpeed,
  qualityPasses,
  totalPasses,
  individualScore,
  side,
  showRadar = false,
  labels = {},
}) {
  const qColor = getQualityColor(qualityPasses);
  const maxLabel = labels.max || 'max';
  const minLabel = labels.min || 'min';
  const totalLabel = labels.total || 'total';
  const minSpeedTag = labels.minSpeedTag || '>=50 Km/h';
  const ptsLabel = labels.pts || 'pts';

  return (
    <div className="flex flex-col items-center w-[30vw] gap-1">
      <div className="flex flex-col items-center gap-1">
        <div className="relative flex items-center justify-center">
          {showRadar && side === 'left' && (
            <Radar className="absolute -left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-[#0f9b8e]" />
          )}
          <div className="w-18 h-18 rounded-full border-4 border-[#0f9b8e] overflow-hidden bg-[#0d0d1a] flex items-center justify-center flex-shrink-0" style={{ width: '4.5rem', height: '4.5rem' }}>
            {photoUrl ? (
              <img src={photoUrl} alt={name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-600 to-gray-800">
                <User className="w-6 h-6 text-gray-300" />
              </div>
            )}
          </div>
          {showRadar && side === 'right' && (
            <Radar className="absolute -right-6 top-1/2 -translate-y-1/2 w-5 h-5 text-[#0f9b8e]" />
          )}
        </div>
        <span className="text-sm font-bold text-[#0f9b8e] max-w-[100px] truncate text-center">{name}</span>
      </div>

      <div className="flex flex-col items-center leading-none">
        <span className="font-bold text-white" style={{ fontSize: 'clamp(1.8rem, 8vw, 4.5rem)' }}>
          {currentSpeed.toFixed(1)}
        </span>
        <span className="text-gray-400 text-[10px]">Km/h</span>
      </div>

      <div className="w-full flex flex-col gap-1">
        <div className="grid grid-cols-2 gap-1">
          <div className="bg-[#0d0d1a] rounded-lg p-1.5 text-center">
            <p className="text-amber-400 font-bold leading-tight" style={{ fontSize: 'clamp(1.1rem, 4.5vw, 2rem)' }}>{maxSpeed.toFixed(1)}</p>
            <p className="text-gray-500 text-[10px]">{maxLabel}</p>
          </div>
          <div className="bg-[#0d0d1a] rounded-lg p-1.5 text-center">
            <p className="text-blue-400 font-bold leading-tight" style={{ fontSize: 'clamp(1.1rem, 4.5vw, 2rem)' }}>{minSpeed > 0 ? minSpeed.toFixed(1) : '-'}</p>
            <p className="text-gray-500 text-[10px]">{minLabel}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-1">
          <div className="bg-[#0d0d1a] rounded-lg p-1.5 text-center">
            <p className="text-white font-bold leading-tight" style={{ fontSize: 'clamp(1.1rem, 4.5vw, 2rem)' }}>{totalPasses}</p>
            <p className="text-gray-500 text-[10px]">{totalLabel}</p>
          </div>
          <div className="bg-[#0d0d1a] rounded-lg p-1.5 text-center">
            <p className="font-bold leading-tight" style={{ fontSize: 'clamp(1.1rem, 4.5vw, 2rem)', color: qColor.num }}>
              {qualityPasses}
              <span style={{ color: qColor.slash150, fontSize: '0.6em' }}>/150</span>
            </p>
            <p className="text-gray-500 text-[10px]">{minSpeedTag}</p>
          </div>
        </div>

        <div className="bg-[#0d0d1a] rounded-lg p-1.5 text-center">
          <div className="flex items-center justify-center gap-1">
            <Star className="w-3 h-3 text-yellow-400 flex-shrink-0" />
            <p className="text-yellow-400 font-bold leading-tight" style={{ fontSize: 'clamp(1.1rem, 4.5vw, 2rem)' }}>{individualScore.toLocaleString()}</p>
            <p className="text-gray-500 text-[10px]">{ptsLabel}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default React.memo(ParticipantCard);
