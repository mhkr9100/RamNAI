import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bot,
  BrainCircuit,
  ChevronLeft,
  ChevronRight,
  FolderKanban,
  MessageSquareMore,
  Settings2,
  Sparkles,
} from 'lucide-react';
import { RamanIcon } from './RamanIcon';
import { Kbd } from './ui';

export type ViewId = 'prism' | 'chats' | 'spectrum' | 'work' | 'usermap' | 'settings';

interface SidebarProps {
  activeView: ViewId;
  onSelect: (view: ViewId) => void;
}

const navItems: Array<{ id: ViewId; label: string; icon: React.ComponentType<{ size?: number }> }> = [
  { id: 'prism', label: 'Prism', icon: Sparkles },
  { id: 'chats', label: 'Chats', icon: MessageSquareMore },
  { id: 'usermap', label: 'UserMap', icon: BrainCircuit },
  { id: 'spectrum', label: 'Spectrum', icon: Bot },
  { id: 'work', label: 'Work', icon: FolderKanban },
];

export function Sidebar({ activeView, onSelect }: SidebarProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <motion.aside
      initial={false}
      animate={{ width: expanded ? 200 : 68 }}
      transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
      className="flex shrink-0 flex-col border-r border-white/[0.06] bg-surface-0 relative z-20 overflow-hidden"
    >
      {/* Brand */}
      <div className="flex h-14 items-center gap-2.5 px-4 border-b border-white/[0.04]">
        <button
          type="button"
          onClick={() => onSelect('prism')}
          className="flex items-center gap-2.5 transition-opacity hover:opacity-80"
          title="RamN AI"
        >
          <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/[0.10] bg-white/[0.04]">
            <RamanIcon size={18} />
          </div>
          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.15 }}
                className="flex flex-col"
              >
                <span className="text-[11px] font-bold text-white/90 whitespace-nowrap">RamN AI</span>
                <span className="text-[9px] font-medium text-brand-light whitespace-nowrap">Beta</span>
              </motion.div>
            )}
          </AnimatePresence>
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto custom-scrollbar">
        {navItems.map((item) => {
          const active = item.id === activeView;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              title={expanded ? undefined : item.label}
              className={[
                'group relative flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] font-medium transition-all duration-150',
                active
                  ? 'bg-brand/[0.12] text-white'
                  : 'text-white/50 hover:bg-white/[0.05] hover:text-white/80',
              ].join(' ')}
            >
              {active && (
                <motion.div
                  layoutId="sidebar-active"
                  className="absolute inset-0 rounded-xl bg-brand/[0.12] border border-brand/[0.15]"
                  transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                />
              )}
              <span className="relative z-10 flex h-7 w-7 shrink-0 items-center justify-center">
                <Icon size={17} />
              </span>
              <AnimatePresence>
                {expanded && (
                  <motion.span
                    initial={{ opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -4 }}
                    transition={{ duration: 0.12 }}
                    className="relative z-10 whitespace-nowrap"
                  >
                    {item.label}
                  </motion.span>
                )}
              </AnimatePresence>
              {active && !expanded && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-brand" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Bottom section */}
      <div className="px-2 pb-3 space-y-0.5">
        {/* Settings */}
        <button
          type="button"
          onClick={() => onSelect('settings')}
          title={expanded ? undefined : 'Settings'}
          className={[
            'group relative flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] font-medium transition-all duration-150',
            activeView === 'settings'
              ? 'bg-brand/[0.12] text-white'
              : 'text-white/50 hover:bg-white/[0.05] hover:text-white/80',
          ].join(' ')}
        >
          {activeView === 'settings' && (
            <motion.div
              layoutId="sidebar-active"
              className="absolute inset-0 rounded-xl bg-brand/[0.12] border border-brand/[0.15]"
              transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            />
          )}
          <span className="relative z-10 flex h-7 w-7 shrink-0 items-center justify-center">
            <Settings2 size={17} />
          </span>
          <AnimatePresence>
            {expanded && (
              <motion.span
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -4 }}
                transition={{ duration: 0.12 }}
                className="relative z-10 whitespace-nowrap"
              >
                Settings
              </motion.span>
            )}
          </AnimatePresence>
        </button>

        {/* Collapse toggle */}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-white/30 hover:text-white/55 hover:bg-white/[0.04] transition-all duration-150"
          title={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center">
            {expanded ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
          </span>
          <AnimatePresence>
            {expanded && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-2 text-[11px] text-white/30 whitespace-nowrap"
              >
                Collapse <Kbd>⌘</Kbd><Kbd>B</Kbd>
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>
    </motion.aside>
  );
}
