import React from 'react';
import { motion } from 'framer-motion';
import { MessageSquare, ClipboardList, Bot, ArrowRight, Zap } from 'lucide-react';
import type { WorkspaceSnapshot } from '../lib/electron';
import type { ViewId } from './Sidebar';
import { Badge } from './ui';
import { AppLogo } from './AppLogo';

interface DashboardViewProps {
  snapshot: WorkspaceSnapshot;
  onNavigate: (view: ViewId) => void;
}

export function DashboardView({ snapshot, onNavigate }: DashboardViewProps) {
  const activeChats = snapshot.chatThreads.filter(t => t.messages.length > 0).length;
  const totalAgents = snapshot.agents.length;
  const totalTasks = snapshot.counts?.tasks ?? snapshot.tasks.length;
  const runningTasks = snapshot.tasks.filter(t => t.status === 'running' || t.status === 'queued').length;
  const recentWork = snapshot.workItems.slice(0, 5);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="flex flex-col items-center text-center space-y-12"
      >
        <div className="text-gray-900 dark:text-white/30">
          <AppLogo size={120} />
        </div>
        <div className="space-y-6">
          <h1 className="text-5xl md:text-7xl font-black tracking-tighter text-gray-900 dark:text-white uppercase leading-none">
            Workspace <span className="text-gray-400 dark:text-white/20">AI</span>
            <span className="text-[12px] uppercase tracking-widest text-slate-400 dark:text-slate-500 font-bold ml-4 align-top border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 rounded px-2 py-0.5">Beta</span>
          </h1>
        </div>
        <div className="flex flex-col md:flex-row gap-4">
          <button
            onClick={() => onNavigate('coordinator')}
            className="px-12 py-5 bg-gray-900 dark:bg-white text-white dark:text-black text-xs font-black uppercase tracking-[0.3em] rounded-2xl transition-all shadow-2xl hover:bg-gray-800 dark:hover:bg-slate-200 active:scale-[0.98]"
          >
            Enter Workspace
          </button>
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="grid grid-cols-3 gap-3 pt-8">
        <motion.button type="button" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} onClick={() => onNavigate('chats')} className="group text-left">
          <div className="p-6 rounded-3xl border border-black/10 dark:border-white/5 bg-white dark:bg-white/[0.02] shadow-xl dark:shadow-none hover:border-black/20 dark:hover:border-white/10 transition-colors">
            <div className="flex items-center justify-between mb-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-300">
                <MessageSquare size={20} />
              </div>
              <ArrowRight size={14} className="text-gray-400 dark:text-white/40 group-hover:text-gray-900 dark:group-hover:text-white transition-colors" />
            </div>
            <p className="text-2xl font-semibold text-gray-900 dark:text-white">{activeChats}</p>
            <p className="text-xs text-gray-500 dark:text-white/40 mt-0.5">Active Chats</p>
          </div>
        </motion.button>
        <motion.button type="button" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} onClick={() => onNavigate('settings')} className="group text-left">
          <div className="p-6 rounded-3xl border border-black/10 dark:border-white/5 bg-white dark:bg-white/[0.02] shadow-xl dark:shadow-none hover:border-black/20 dark:hover:border-white/10 transition-colors">
            <div className="flex items-center justify-between mb-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-300">
                <Bot size={20} />
              </div>
              <ArrowRight size={14} className="text-gray-400 dark:text-white/40 group-hover:text-gray-900 dark:group-hover:text-white transition-colors" />
            </div>
            <p className="text-2xl font-semibold text-gray-900 dark:text-white">{totalAgents}</p>
            <p className="text-xs text-gray-500 dark:text-white/40 mt-0.5">Agents</p>
          </div>
        </motion.button>
        <motion.button type="button" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} onClick={() => onNavigate('work')} className="group text-left">
          <div className="p-6 rounded-3xl border border-black/10 dark:border-white/5 bg-white dark:bg-white/[0.02] shadow-xl dark:shadow-none hover:border-black/20 dark:hover:border-white/10 transition-colors">
            <div className="flex items-center justify-between mb-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-black/5 dark:bg-white/8 text-gray-900 dark:text-white">
                <ClipboardList size={20} />
              </div>
              <ArrowRight size={14} className="text-gray-400 dark:text-white/40 group-hover:text-gray-900 dark:group-hover:text-white transition-colors" />
            </div>
            <p className="text-2xl font-semibold text-gray-900 dark:text-white">{totalTasks}</p>
            <p className="text-xs text-gray-500 dark:text-white/40 mt-0.5">Tasks{runningTasks > 0 ? ` (${runningTasks})` : ''}</p>
          </div>
        </motion.button>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="pt-8">
        <h2 className="text-[10px] font-black text-gray-400 dark:text-white/30 uppercase tracking-[0.5em] mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 gap-4">
          <button type="button" onClick={() => onNavigate('coordinator')} className="p-6 rounded-3xl border border-black/10 dark:border-white/5 bg-white dark:bg-white/[0.02] flex gap-6 text-left shadow-xl dark:shadow-none hover:border-black/20 dark:hover:border-white/10 transition-colors">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-300 flex-shrink-0">
              <Zap size={20} />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-widest">Ask Coordinator</h3>
              <p className="text-xs text-gray-600 dark:text-white/40 mt-1 leading-relaxed">Strategy, prompts, architecture</p>
            </div>
          </button>
          <button type="button" onClick={() => onNavigate('coordinator')} className="p-6 rounded-3xl border border-black/10 dark:border-white/5 bg-white dark:bg-white/[0.02] flex gap-6 text-left shadow-xl dark:shadow-none hover:border-black/20 dark:hover:border-white/10 transition-colors">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-600 dark:text-amber-300 flex-shrink-0">
              <Bot size={20} />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-widest">Create Agent</h3>
              <p className="text-xs text-gray-600 dark:text-white/40 mt-1 leading-relaxed">Design from an objective</p>
            </div>
          </button>
        </div>
      </motion.div>

      {recentWork.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="pt-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[10px] font-black text-gray-400 dark:text-white/30 uppercase tracking-[0.5em]">Recent Work</h2>
            <button type="button" onClick={() => onNavigate('work')} className="text-[10px] font-bold text-emerald-600 dark:text-emerald-300 hover:text-emerald-700 dark:hover:text-emerald-200 transition-colors uppercase tracking-wider">
              View all
            </button>
          </div>
          <div className="space-y-1.5">
            {recentWork.map((item) => (
              <div key={item.id} className="flex items-center gap-3 rounded-2xl border border-black/5 dark:border-white/5 bg-white dark:bg-white/[0.02] px-4 py-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900 dark:text-white/70 truncate">{item.title}</p>
                </div>
                <Badge variant={item.status === 'done' ? 'success' : item.status === 'failed' ? 'error' : 'default'}>
                  {item.status}
                </Badge>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}
