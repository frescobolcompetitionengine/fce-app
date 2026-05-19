import React, { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { useI18n } from '@/lib/i18n';

const LANGUAGE_FLAGS = [
  { value: 'pt-BR', label: 'Português-BR', flag: '🇧🇷' },
  { value: 'en', label: 'English', flag: '🇺🇸' },
  { value: 'ja', label: '日本語', flag: '🇯🇵' },
];

export default function Login() {
  const { isAuthenticated, authError, login, enterSpectatorMode } = useAuth();
  const { language, setLanguage, t } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (isAuthenticated) return <Navigate to="/" replace />;

  const onSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await login({ email, password });
    } catch (err) {
      if (err?.code === 'subscription_expired') {
        setError(t('loginExpired'));
      } else {
        setError(err?.message || t('loginFailed'));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#1a1a2e] to-[#0d0d1a] text-white p-4">
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-20">
        <div className="bg-[#16213e] border border-[#2a2a4a] rounded-full px-2 py-1.5 flex items-center gap-1.5">
          {LANGUAGE_FLAGS.map((item) => (
            <button
              key={item.value}
              onClick={() => setLanguage(item.value)}
              className={`w-7 h-7 rounded-full text-sm flex items-center justify-center transition-colors ${
                language === item.value ? 'bg-[#0f9b8e]/30 border border-[#0f9b8e]' : 'bg-[#0d0d1a] border border-[#2a2a4a] hover:bg-[#1d274b]'
              }`}
            >
              {item.flag}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-lg mx-auto space-y-0 py-8">
        <div className="text-center">
          <img
            src="/FCE_Logo.png"
            alt="FCE Logo"
            className="w-96 md:w-[28rem] mx-auto"
          />
        </div>

        <div className="bg-[#16213e] rounded-2xl p-6 border border-[#2a2a4a]">
          {authError?.type === 'subscription_expired' ? (
            <div className="mb-4 rounded-xl border border-red-700 bg-red-950/40 p-3 text-sm text-red-200">
              {t('loginExpired')}
            </div>
          ) : null}
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="text-sm text-gray-400">{t('email')}</label>
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required className="mt-1 w-full h-12 rounded-xl bg-[#0d0d1a] border border-[#3a3a5a] px-3 text-white" />
            </div>
            <div>
              <label className="text-sm text-gray-400">{t('password')}</label>
              <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required className="mt-1 w-full h-12 rounded-xl bg-[#0d0d1a] border border-[#3a3a5a] px-3 text-white" />
            </div>
            {error ? <p className="text-sm text-red-400">{error}</p> : null}
            <button disabled={loading} type="submit" className="w-full h-12 rounded-full bg-[#e94560] hover:bg-[#c73e54] transition-colors font-semibold disabled:opacity-60">
              {loading ? t('signingIn') : t('signIn')}
            </button>
            <button
              type="button"
              onClick={enterSpectatorMode}
              className="w-full h-12 rounded-full bg-gray-700 hover:bg-gray-600 transition-colors font-semibold text-gray-200"
            >
              {t('spectator')}
            </button>
          </form>
          <p className="mt-3 text-right text-[11px] font-medium tracking-wide text-gray-500">
            Powered by ChatGPT.OpenIA
          </p>
        </div>
      </div>
    </div>
  );
}

