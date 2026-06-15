// features/contacts/components/WalletImportForm.tsx
'use client';

import React, { useState, useRef } from 'react';
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

interface ImportResult {
  success: boolean;
  contactsCreated: number;
  contactsUpdated: number;
  dealsCreated: number;
  dealsUpdated: number;
  boardsCreated: number;
  sellers: string[];
  errors: number;
  message: string;
}

export const WalletImportForm: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (f: File | null) => {
    setFile(f);
    setResult(null);
    setError(null);
  };

  const handleSubmit = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/contacts/import-wallet', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao processar arquivo');

      setResult(data);
      setFile(null);
      if (inputRef.current) inputRef.current.value = '';
    } catch (e: any) {
      setError(e.message || 'Erro ao processar arquivo');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-dark-card border border-slate-200 dark:border-white/10 rounded-2xl p-6 max-w-2xl">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 bg-primary-100 dark:bg-primary-500/20 rounded-lg text-primary-600 dark:text-primary-400">
          <FileSpreadsheet size={20} />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white font-display">
            Atualizar Carteira de Clientes
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Faça upload semanal da base para atualizar carteiras e gerar tarefas automáticas
          </p>
        </div>
      </div>

      <div className="bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl p-4 mb-4">
        <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2">
          Formato do CSV
        </p>
        <code className="text-xs text-slate-700 dark:text-slate-300 block whitespace-pre-wrap">
          nome,telefone,email,vendedor,ultima_compra,valor{'\n'}
          Maria Silva,11999999999,maria@email.com,Priscila,2026-06-10,450.00{'\n'}
          João Santos,11888888888,joao@email.com,Juliana,2026-04-01,1200.00
        </code>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
          Colunas <strong>nome</strong> e <strong>telefone</strong> são obrigatórias. O nome do
          vendedor deve corresponder ao nome cadastrado no CRM — será criado um board
          &quot;Carteira [Vendedor]&quot; automaticamente.
        </p>
      </div>

      <div
        className="border-2 border-dashed border-slate-300 dark:border-white/10 rounded-xl p-6 text-center cursor-pointer hover:border-primary-400 dark:hover:border-primary-500/50 transition-colors"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files?.[0];
          if (f) handleFileChange(f);
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
        />
        <Upload size={32} className="mx-auto mb-2 text-slate-400" />
        {file ? (
          <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{file.name}</p>
        ) : (
          <>
            <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
              Arraste o arquivo CSV aqui ou clique para selecionar
            </p>
            <p className="text-xs text-slate-400 mt-1">Apenas arquivos .csv</p>
          </>
        )}
      </div>

      <button
        onClick={handleSubmit}
        disabled={!file || loading}
        className="w-full mt-4 px-4 py-2.5 bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-colors"
      >
        {loading ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <Upload size={16} />
        )}
        {loading ? 'Processando...' : 'Importar e Atualizar Carteiras'}
      </button>

      {error && (
        <div className="mt-4 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-500/20 rounded-lg p-3 flex items-start gap-2">
          <AlertCircle size={16} className="text-red-500 mt-0.5 shrink-0" />
          <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
        </div>
      )}

      {result && (
        <div className="mt-4 bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-500/20 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 size={18} className="text-green-600 dark:text-green-400" />
            <p className="text-sm font-bold text-green-700 dark:text-green-400">
              Importação concluída!
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-white dark:bg-black/20 rounded-lg p-2">
              <p className="text-slate-500 dark:text-slate-400">Contatos novos</p>
              <p className="text-lg font-bold text-slate-900 dark:text-white">{result.contactsCreated}</p>
            </div>
            <div className="bg-white dark:bg-black/20 rounded-lg p-2">
              <p className="text-slate-500 dark:text-slate-400">Contatos atualizados</p>
              <p className="text-lg font-bold text-slate-900 dark:text-white">{result.contactsUpdated}</p>
            </div>
            <div className="bg-white dark:bg-black/20 rounded-lg p-2">
              <p className="text-slate-500 dark:text-slate-400">Cards criados</p>
              <p className="text-lg font-bold text-slate-900 dark:text-white">{result.dealsCreated}</p>
            </div>
            <div className="bg-white dark:bg-black/20 rounded-lg p-2">
              <p className="text-slate-500 dark:text-slate-400">Cards atualizados</p>
              <p className="text-lg font-bold text-slate-900 dark:text-white">{result.dealsUpdated}</p>
            </div>
          </div>
          {result.sellers.length > 0 && (
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-3">
              <strong>Novos boards de carteira criados:</strong>{' '}
              {result.sellers.map(s => `Carteira ${s}`).join(', ')}
            </p>
          )}
          {result.errors > 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
              ⚠️ {result.errors} linha(s) com erro foram ignoradas.
            </p>
          )}
        </div>
      )}
    </div>
  );
};
