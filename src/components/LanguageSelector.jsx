import React from 'react';
import { Languages, ChevronDown } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

const LANGUAGE_OPTIONS = [
  { value: 'pt-BR', label: 'Português-BR' },
  { value: 'en', label: 'English' },
  { value: 'ja', label: '日本語' },
];

export default function LanguageSelector({ value, onChange }) {
  const { t } = useI18n();

  return (
    <div className="bg-[#16213e] rounded-2xl p-6 border border-[#2a2a4a]">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-3 rounded-xl bg-[#0f9b8e]/20">
          <Languages className="w-6 h-6 text-[#0f9b8e]" />
        </div>
        <div>
          <h2 className="text-xl font-bold">{t('language')}</h2>
        </div>
      </div>

      <label className="relative block">
        <span className="sr-only">{t('language')}</span>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full h-11 appearance-none rounded-xl bg-[#0d0d1a] border border-[#3a3a5a] px-3 pr-10 text-white"
        >
          {LANGUAGE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
      </label>
    </div>
  );
}
