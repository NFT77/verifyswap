// components/TrustScore.jsx
'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';

export default function TrustScore({ score, showLabel = true, size = 'default', animated = true }) {
  if (!score && score !== 0) return null;

  // Determine color and label based on score
  let color = 'bg-red-500';
  let textColor = 'text-red-400';
  let label = 'Low Trust';
  let bgColor = 'bg-red-500/20';

  if (score >= 80) {
    color = 'bg-green-500';
    textColor = 'text-green-400';
    label = 'Very High Trust';
    bgColor = 'bg-green-500/20';
  } else if (score >= 70) {
    color = 'bg-green-500';
    textColor = 'text-green-400';
    label = 'High Trust';
    bgColor = 'bg-green-500/20';
  } else if (score >= 55) {
    color = 'bg-yellow-500';
    textColor = 'text-yellow-400';
    label = 'Good Trust';
    bgColor = 'bg-yellow-500/20';
  } else if (score >= 40) {
    color = 'bg-yellow-500';
    textColor = 'text-yellow-400';
    label = 'Medium Trust';
    bgColor = 'bg-yellow-500/20';
  } else if (score >= 25) {
    color = 'bg-orange-500';
    textColor = 'text-orange-400';
    label = 'Low Trust';
    bgColor = 'bg-orange-500/20';
  } else {
    color = 'bg-red-500';
    textColor = 'text-red-400';
    label = 'Very Low Trust';
    bgColor = 'bg-red-500/20';
  }

  // Size variants
  const sizes = {
    small: { barWidth: 40, barHeight: 3, fontSize: 'text-xs', gap: 1 },
    default: { barWidth: 64, barHeight: 4, fontSize: 'text-sm', gap: 2 },
    large: { barWidth: 100, barHeight: 6, fontSize: 'text-base', gap: 3 },
  };

  const { barWidth, barHeight, fontSize, gap } = sizes[size] || sizes.default;

  const [showTooltip, setShowTooltip] = useState(false);

  const getRecommendation = () => {
    if (score >= 70) return 'Low risk. This creator is trusted.';
    if (score >= 40) return 'Medium risk. Do your own research.';
    return 'High risk. Be very cautious.';
  };

  const getIcon = () => {
    if (score >= 70) return '🟢';
    if (score >= 40) return '🟡';
    return '🔴';
  };

  return (
    <div 
      className="inline-flex items-center gap-2 group relative"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      {/* Tooltip */}
      {showTooltip && (
        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap z-10 shadow-lg border border-white/10">
          <div className="flex items-center gap-2">
            <span>{getIcon()}</span>
            <span>{getRecommendation()}</span>
          </div>
          <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-1 border-4 border-transparent border-t-gray-900"></div>
        </div>
      )}
      
      {/* Score bar */}
      <div className={`w-${barWidth} h-${barHeight} bg-gray-700 rounded-full overflow-hidden`}>
        <motion.div 
          className={`h-full ${color} rounded-full`}
          initial={animated ? { width: 0 } : false}
          animate={{ width: `${score}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
      </div>
      
      {/* Score text and label */}
      <div className={`flex items-center gap-${gap}`}>
        <span className={`font-mono font-bold ${textColor} ${fontSize}`}>
          {score}%
        </span>
        {showLabel && (
          <span className={`text-gray-400 ${fontSize}`}>
            ({label})
          </span>
        )}
      </div>
    </div>
  );
}

// Compact version for tables/lists
export function CompactTrustScore({ score }) {
  if (!score && score !== 0) return null;

  let bgColor = 'bg-green-500';
  if (score < 70) bgColor = 'bg-yellow-500';
  if (score < 40) bgColor = 'bg-red-500';

  return (
    <div className="flex items-center gap-1">
      <div className={`w-2 h-2 rounded-full ${bgColor}`} />
      <span className="text-xs font-mono text-gray-300">{score}%</span>
    </div>
  );
}

// Circle version for dashboard
export function CircleTrustScore({ score, size = 60 }) {
  if (!score && score !== 0) return null;

  const radius = size / 2 - 5;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  let color = '#10b981';
  if (score < 70) color = '#eab308';
  if (score < 40) color = '#ef4444';

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="transform -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#374151"
          strokeWidth="4"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="4"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-xl font-bold text-white">{score}%</span>
      </div>
    </div>
  );
}