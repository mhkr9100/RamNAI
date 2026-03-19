import React from 'react';
import { motion } from 'framer-motion';
import { MessageSquare, ClipboardList, Bot, ArrowRight, Zap } from 'lucide-react';
import type { WorkspaceSnapshot } from '../lib/electron';
import type { ViewId } from './Sidebar';
import { Card, Badge } from './ui';
import { RamanIcon } from './RamanIcon';

interface DashboardViewProps {
  snapshot: WorkspaceSnapshot;
  onNavigate: (view: ViewId) => void;
}

export function DashboardView({ snapshot, onNavigate }: DashboardViewProps) {
  const activeChats = snapshot.chatThreads.filter(t => t.messages.length > 0).length;
  const totalAgents = snapshot.agents.length;
  const totalTasks = snapshot.tasks.length;
  const runningTasks = snapshot.tasks.filter(t => t.status === 'running' || t.status === 'queued').length;
  const recentWork = snapshot.workItems.slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Welcome header */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-4"
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04]">
          <RamanIcon size={24} />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-white">
            {snapshot.profile?.name ? `Welcome, ${snapshot.profile.name}` : 'Dashboard'}
          </h1>
          <p className="text-sm text-white/40 mt-0.5">Your workspace at a glance</p>
        </div>
      </motion.div>

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-3">
        <motion.button
          type="button"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          onClick={() => onNavigate('chats')}
          className="group text-left"
        >
          <Card className="p-4 hover:border-white/[0.12] transition-colors cursor-pointer">
            <div className="flex items-center justify-between mb-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand/10">
                <MessageSquare size={16} className="text-brand-light" />
              </div>
              <ArrowRight size={14} className="text-white/20 group-hover:text-white/50 transition-colors" />
            </div>
            <p className="text-2xl font-semibold text-white">{activeChats}</p>
            <p className="text-xs text-white/40 mt-0.5">Active Chats</p>
          </Card>
        </motion.button>

        <motion.button
          type="button"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          onClick={() => onNavigate('spectrum')}
          className="group text-left"
        >
          <Card className="p-4 hover:border-white/[0.12] transition-colors cursor-pointer">
            <div className="flex items-center justify-between mb-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#38bdf8]/10">
                <Bot size={16} className="text-[#38bdf8]" />
              </div>
              <ArrowRight size={14} className="text-white/20 group-hover:text-white/50 transition-colors" />
            </div>
            <p className="text-2xl font-semibold text-white">{totalAgents}</p>
            <p className="text-xs text-white/40 mt-0.5">Agents</p>
          </Card>
        </motion.button>

        <motion.button
          type="button"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          onClick={() => onNavigate('work')}
          className="group text-left"
        >
          <Card className="p-4 hover:border-white/[0.12] transition-colors cursor-pointer">
            <div className="flex items-center justify-between mb-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#a78bfa]/10">
                <ClipboardList size={16} className="text-[#a78bfa]" />
              </div>
              <ArrowRight size={14} className="text-white/20 group-hover:text-white/50 transition-colors" />
            </div>
            <p className="text-2xl font-semibold text-white">{totalTasks}</p>
            <p className="text-xs text-white/40 mt-0.5">
              Tasks{runningTasks > 0 ? ` (${runningTasks} active)` : ''}
            </p>
          </Card>
        </motion.button>
      </div>

      {/* Quick actions */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-white/30 mb-3">Quick Actions</h2>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => onNavigate('prism')} className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-surface-3 px-4 py-3 text-left hover:border-white/[0.10] hover:bg-surface-4 transition-colors">
            <Zap size={16} className="text-brand-light shrink-0" />
            <div>
              <p className="text-sm font-medium text-white/80">Ask Prism</p>
              <p className="text-[11px] text-white/30">Strategy, prompts, architecture</p>
            </div>
          </button>
          <button type="button" onClick={() => onNavigate('prism')} className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-surface-3 px-4 py-3 text-left hover:border-white/[0.10] hover:bg-surface-4 transition-colors">
            <Bot size={16} className="text-[#38bdf8] shrink-0" />
            <div>
              <p className="text-sm font-medium text-white/80">Create Agent</p>
              <p className="text-[11px] text-white/30">Design from an objective</p>
            </div>
          </button>
        </div>
      </motion.div>

      {/* Recent work */}
      {recentWork.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-white/30">Recent Work</h2>
            <button type="button" onClick={() => onNavigate('work')} className="text-[11px] text-brand-light hover:text-brand transition-colors">
              View all
            </button>
          </div>
          <div className="space-y-1.5">
            {recentWork.map((item) => (
              <div key={item.id} className="flex items-center gap-3 rounded-xl border border-white/[0.04] bg-surface-3/50 px-4 py-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white/70 truncate">{item.title}</p>
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
