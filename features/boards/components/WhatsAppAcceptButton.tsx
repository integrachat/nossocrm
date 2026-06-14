// features/boards/components/WhatsAppAcceptButton.tsx
import React, { useState } from 'react';
import { MessageCircle, Loader2, AlertCircle } from 'lucide-react';

export interface WhatsAppAcceptButtonProps {
  dealId: string;
  onAccepted?: () => void;
}

/**
 * WhatsAppAcceptButton — exibido quando um lead do WhatsApp está "Aguardando" no Televendas.
 * Ao clicar, atribui a conversa ao vendedor logado e move o negócio para o pipeline dele.
 */
export const WhatsAppAcceptButton: React.FC<WhatsAppAcceptButtonProps> = ({ dealId, onAccepted }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAccept = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/whatsapp/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dealId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao iniciar conversa');
      onAccepted?.();
    } catch (e: any) {
      setError(e.message || 'Erro ao iniciar conversa');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mb-4 bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-500/20 rounded-xl p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
          <MessageCircle size={18} />
          <span className="text-sm font-bold">Lead aguardando atendimento via WhatsApp</span>
        </div>
        <button
          onClick={handleAccept}
          disabled={loading}
          className="px-4 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white rounded-lg text-sm font-bold flex items-center gap-2 transition-colors"
        >
          {loading ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <MessageCircle size={14} />
          )}
          Iniciar Conversa
        </button>
      </div>
      {error && (
        <p className="text-xs text-red-500 mt-2 flex items-center gap-1">
          <AlertCircle size={12} /> {error}
        </p>
      )}
    </div>
  );
};
