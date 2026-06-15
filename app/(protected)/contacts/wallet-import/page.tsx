// app/(protected)/contacts/wallet-import/page.tsx
import React from 'react';
import { WalletImportForm } from '@/features/contacts/components/WalletImportForm';

export const metadata = {
  title: 'Atualizar Carteira | NossoCRM',
};

export default function WalletImportPage() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white font-display">
          Carteira de Clientes
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Faça upload semanal da base de contatos para distribuir entre as carteiras dos vendedores.
        </p>
      </div>

      <WalletImportForm />
    </div>
  );
}
