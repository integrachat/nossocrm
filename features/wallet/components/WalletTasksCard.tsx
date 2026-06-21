// features/wallet/components/WalletTasksCard.tsx
'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Phone, CheckCircle2, Loader2, Wallet, ChevronDown, ChevronUp } from 'lucide-react';

interface WalletTask {
  id: string;
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  status: 'pending' | 'done' | 'skipped';
  contact_id: string;
  contacts: { name: string; phone: string } | null;
}

const PRIORITY_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  high:   { bg: 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-500/20',     text: 'text-red-700 dark:text-red-400',     label: 'Urgente' },
  medium: { bg: 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-500/20', text: 'text-amber-700 dark:text-amber-400', label: 'Médio' },
  low:    { bg: 'bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10',        text: 'text-slate-600 dark:text-slate-300',  label: 'Baixo' },
};

/**
 * WalletTasksCard — exibe as tarefas diárias de contato com a carteira, geradas por IA.
 * Renderizado no topo do Inbox, no mesmo padrão visual dos outros cards de diagnóstico.
 */
export const WalletTasksCard: React.FC = () => {
  const [tasks, setTasks] = useState<WalletTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch('/api/wallet/tasks/today');
      if (!res.ok) {
        setTasks([]);
        return;
      }
      const data = await res.json();
      setTasks(data.tasks || []);
    } catch {
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const handleComplete = async (taskId: string) => {
    setCompletingId(taskId);
    try {
      const res = await fetch(`/api/wallet/tasks/${taskId}/complete`, { method: 'POST' });
      if (res.ok) {
        setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: 'done' } : t));
      }
    } finally {
      setCompletingId(null);
    }
  };

  if (loading) return null;
  if (tasks.length === 0) return null;

  const pending = tasks.filter(t => t.status === 'pending');
  const done = tasks.filter(t => t.status === 'done');
  const visibleTasks = expanded ? tasks : pending.slice(0, 3);

  return (
    <div className="bg-white dark:bg-dark-card border border-slate-200 dark:border-white/10 rounded-xl p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-primary-100 dark:bg-primary-500/20 rounded-lg text-primary-600 dark:text-primary-400">
            <Wallet size={16} />
          </div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            Carteira Hoje
          </h3>
          <span className="text-xs text-slate-400">
            {pending.length} pendente{pending.length !== 1 ? 's' : ''} · {done.length} concluída{done.length !== 1 ? 's' : ''}
          </span>
        </div>
        {tasks.length > 3 && (
          <button
            onClick={() => setExpanded(v => !v)}
            className="text-xs font-medium text-primary-600 dark:text-primary-400 flex items-center gap-1 hover:underline"
          >
            {expanded ? 'Ver menos' : `Ver todas (${tasks.length})`}
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        )}
      </div>

      <div className="space-y-2">
        {visibleTasks.map(task => {
          const style = PRIORITY_STYLES[task.priority] || PRIORITY_STYLES.medium;
          const isDone = task.status === 'done';

          return (
            <div
              key={task.id}
              className={`border rounded-lg p-3 flex items-start gap-3 transition-opacity ${style.bg} ${isDone ? 'opacity-50' : ''}`}
            >
              <button
                onClick={() => !isDone && handleComplete(task.id)}
                disabled={isDone || completingId === task.id}
                className="mt-0.5 shrink-0"
                title={isDone ? 'Concluída' : 'Marcar como concluída'}
              >
                {completingId === task.id ? (
                  <Loader2 size={18} className="animate-spin text-slate-400" />
                ) : (
                  <CheckCircle2
                    size={18}
                    className={isDone ? 'text-green-500 fill-green-100 dark:fill-green-900/30' : 'text-slate-300 dark:text-slate-600 hover:text-primary-500'}
                  />
                )}
              </button>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className={`text-sm font-bold text-slate-900 dark:text-white ${isDone ? 'line-through' : ''}`}>
                    {task.title}
                  </p>
                  <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${style.text}`}>
                    {style.label}
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  {task.description}
                </p>
                {task.contacts?.phone && (
                  <a
                    href={`https://wa.me/${task.contacts.phone.replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 mt-1.5 text-xs font-medium text-green-600 dark:text-green-400 hover:underline"
                  >
                    <Phone size={12} /> {task.contacts.phone}
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
