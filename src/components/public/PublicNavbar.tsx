import React from 'react';
import { ArrowRight, Lock, Plus } from 'lucide-react';
import { DEFAULT_LOGO_URL } from '../../services/crmService';

interface PublicNavbarProps {
  currentPath: string;
  onNavigatePath: (path: string) => void;
}

export const PublicNavbar: React.FC<PublicNavbarProps> = ({
  currentPath,
  onNavigatePath,
}) => {
  return (
    <header className="sticky top-0 z-40 h-16 bg-[#FFFFFF]/95 backdrop-blur-md border-b border-[#E5E4DA]">
      <div className="max-w-7xl mx-auto h-full px-4 sm:px-6 flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => onNavigatePath('/')}
          className="flex items-center gap-2.5 text-left group cursor-pointer shrink-0"
        >
          <img
            src={DEFAULT_LOGO_URL}
            alt="Teakees Real Estate"
            className="w-9 h-9 rounded-full object-cover border border-[#E5E4DA] bg-[#FFFFFF]"
          />
          <div>
            <span className="text-[15px] font-semibold tracking-tight text-[#20251F] group-hover:text-[#064E3B] transition-colors block">
              Teakees Real Estate
            </span>
            <span className="text-[11px] text-[#77796F] hidden sm:block">
              Curated Land, Residences & Investment Estates
            </span>
          </div>
        </button>

        <nav className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => onNavigatePath('/')}
            className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              currentPath === '/'
                ? 'bg-[#E4EBE0] text-[#064E3B] font-semibold'
                : 'text-[#20251F] hover:bg-[#F1F0E8]'
            }`}
          >
            Properties
          </button>

          <button
            type="button"
            onClick={() => onNavigatePath('/submit-property')}
            className={`h-9 px-3.5 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
              currentPath === '/submit-property'
                ? 'bg-[#151D18] text-[#FFFFFF]'
                : 'bg-[#064E3B] hover:bg-[#176B50] text-[#FFFFFF]'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Submit Your Property</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigatePath('/crm')}
            className="h-9 px-3 rounded-lg border border-[#E5E4DA] bg-[#FFFFFF] hover:bg-[#F1F0E8] text-xs font-medium text-[#20251F] inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Lock className="w-3.5 h-3.5 text-[#064E3B]" />
            <span className="hidden sm:inline">Staff CRM</span>
            <ArrowRight className="w-3 h-3 text-[#77796F] sm:hidden" />
          </button>
        </nav>
      </div>
    </header>
  );
};
