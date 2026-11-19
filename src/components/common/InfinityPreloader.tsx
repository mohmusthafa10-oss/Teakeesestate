import React from 'react';
import { useCRM } from '../../context/CRMContext';

export const InfinityPreloader: React.FC<{ visible: boolean }> = ({ visible }) => {
  const { db } = useCRM();

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading workspace"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#F1F0E8]/95 backdrop-blur-sm transition-opacity duration-200"
    >
      <div className="flex flex-col items-center gap-5">
        <div className="animate-infinity-pulse">
          <svg
            width="124"
            height="62"
            viewBox="0 0 124 62"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            {/* Base soft sage track */}
            <path
              d="M32 13C19.8497 13 10 21.5066 10 31C10 40.4934 19.8497 49 32 49C47 49 55 31 62 31C69 31 77 13 92 13C104.15 13 114 21.5066 114 31C114 40.4934 104.15 49 92 49C77 49 69 31 62 31C55 31 47 13 32 13Z"
              stroke="#A8B9A2"
              strokeOpacity="0.45"
              strokeWidth="4.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Animated forest green looping stroke */}
            <path
              d="M32 13C19.8497 13 10 21.5066 10 31C10 40.4934 19.8497 49 32 49C47 49 55 31 62 31C69 31 77 13 92 13C104.15 13 114 21.5066 114 31C114 40.4934 104.15 49 92 49C77 49 69 31 62 31C55 31 47 13 32 13Z"
              stroke="#064E3B"
              strokeWidth="4.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="animate-infinity-stroke"
            />
          </svg>
        </div>
        <div className="text-center flex flex-col items-center gap-1.5">
          {db.settings.logoUrl && (
            <img
              src={db.settings.logoUrl}
              alt={`${db.settings.agencyName} logo`}
              className="w-10 h-10 rounded-full object-cover border border-[#E5E4DA] bg-[#FFFFFF]"
            />
          )}
          <p className="text-sm font-semibold tracking-tight text-[#20251F]">
            {db.settings.agencyName}
          </p>
          <p className="text-xs text-[#77796F]">
            Synchronizing property records
          </p>
        </div>
      </div>
    </div>
  );
};
