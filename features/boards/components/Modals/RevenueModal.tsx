// features/boards/components/Modals/RevenueModal.tsx
import React, { useEffect, useState } from 'react';
import { DollarSign, X, Check } from 'lucide-react';

export interface RevenueModalProps {
  isOpen: boolean;
  dealTitle: string;
  initialValue?: string;
  onClose: () => void;
  onConfirm: (amount: number) => void | Promise<void>;
}

/**
 * RevenueModal — solicita o valor da receita antes de marcar um negócio como Ganho.
 */
export const RevenueModal: React.FC<RevenueModalProps> = ({
  isOpen,
  dealTitle,
  initialValue = '',
  onClose,
  onConfirm,
}) => {
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setValue(initialValue);
      setError(null);
      setSubmitting(false);
    }
  }, [isOpen, initialValue]);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    const amount = Number(value.replace(',', '.'));
    if (!value || isNaN(amount) || amount <= 0) {
      setError('Informe um valor de receita válido maior que zero.');
      return;
    }
    setSubmitting(true);
    try {
      await onConfirm(amount);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white dark:bg-dark-card border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl w-full max-w-md p-6 animate-in zoom-in-95 duration-200">
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 dark:bg-green-500/20 rounded-lg text-green-600 dark:text-green-400">
              <DollarSign size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white font-display">
                Confirmar Receita
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[260px]">
                {dealTitle}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-white"
            aria-label="Fechar"
          >
            <X size={20} />
          </button>
        </div>

        <p className="text-sm text-slate-600 dark:text-slate-300 mb-3">
          Informe o valor (R$) que foi efetivamente fechado nesta venda. Esse valor será
          contabilizado na receita total e na performance do vendedor.
        </p>

        <label className="block text-xs font-bold text-slate-400 uppercase mb-1">
          Valor da venda (R$)
        </label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400 font-mono">
            R$
          </span>
          <input
            autoFocus
            type="text"
            inputMode="decimal"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleConfirm();
            }}
            placeholder="0,00"
            className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg pl-10 pr-3 py-2.5 text-lg font-mono font-bold outline-none focus:ring-2 focus:ring-green-500 dark:text-white"
          />
        </div>

        {error && (
          <p className="text-xs text-red-500 mt-2">{error}</p>
        )}

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg font-bold text-sm transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={submitting}
            className="flex-1 px-4 py-2.5 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white rounded-lg font-bold text-sm shadow-sm flex items-center justify-center gap-2 transition-colors"
          >
            {submitting ? (
              <div className="animate-spin w-4 h-4 border-2 border-current border-t-transparent rounded-full" />
            ) : (
              <Check size={16} />
            )}
            Confirmar Ganho
          </button>
        </div>
      </div>
    </div>
  );
};
