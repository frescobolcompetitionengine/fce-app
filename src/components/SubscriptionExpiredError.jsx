import React from 'react';

const SubscriptionExpiredError = () => {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-[#1a1a2e] to-[#0d0d1a] px-4">
      <div className="max-w-md w-full p-8 bg-[#16213e] rounded-2xl shadow-2xl border border-[#2a2a4a] text-white">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 mb-6 rounded-full bg-red-900/40 border border-red-700">
            <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold mb-3">Login expirado</h1>
          <p className="text-gray-300 mb-6">
            Este usuário está fora do prazo de acesso. Para continuar usando o aplicativo, é preciso renovar a assinatura.
          </p>
          <div className="p-4 bg-[#0d0d1a] rounded-xl text-sm text-gray-300 border border-[#2a2a4a]">
            <p>Você pode:</p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Renovar o prazo do usuário no painel administrativo</li>
              <li>Reativar o usuário depois da renovação</li>
              <li>Fazer login novamente após a atualização</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SubscriptionExpiredError;
