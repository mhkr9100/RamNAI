import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, PenTool, Settings2, User } from 'lucide-react';
import { RamanIcon } from './RamanIcon';
import { PrismIcon } from './icons/PrismIcon';
import { UserMapIcon } from './icons/UserMapIcon';
import { ChatIcon } from './icons/ChatIcon';
import { Kbd } from './ui';

export type ViewId = 'home' | 'prism' | 'chats' | 'canvas' | 'work' | 'usermap' | 'settings';

interface SidebarProps {
  activeView: ViewId;
  onSelect: (view: ViewId) => void;
}

const mainNavItems: Array<{ id: ViewId; label: string; icon: React.ComponentType<{ size?: number }> }> = [
  { id: 'prism', label: 'Prism', icon: PrismIcon },
  { id: 'usermap', label: 'UserMap', icon: UserMapIcon },
  { id: 'chats', label: 'Chats', icon: ChatIcon },
  { id: 'canvas', label: 'Canvas', icon: PenTool },
];

function NavButton({
  id,
  label,
  icon: Icon,
  active,
  expanded,
  onSelect,
}: {
  id: ViewId;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
  active: boolean;
  expanded: boolean;
  onSelect: (id: ViewId) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      title={expanded ? undefined : label}
      aria-current={active ? 'page' : undefined}
      className={[
        'group relative flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] font-medium transition-all duration-150',
        active
          ? 'bg-gray-800 dark:bg-white text-white dark:text-black'
          : 'text-gray-500 dark:text-white/60 hover:text-gray-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5',
      ].join(' ')}
    >
      {active && (
        <motion.div
          layoutId="sidebar-active"
          className="absolute inset-0 rounded-xl bg-gray-800 dark:bg-white"
          transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
        />
      )}
      <span className={`relative z-10 flex h-7 w-7 shrink-0 items-center justify-center ${active ? 'text-white dark:text-black' : ''}`}>
        <Icon size={active ? 20 : 17} />
      </span>
      <AnimatePresence>
        {expanded && (
          <motion.span
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -4 }}
            transition={{ duration: 0.12 }}
            className="relative z-10 whitespace-nowrap text-[11px] tracking-[0.06em] font-semibold"
          >
            {label}
          </motion.span>
        )}
      </AnimatePresence>
      {active && !expanded && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-emerald-500" />
      )}
    </button>
  );
}

export function Sidebar({ activeView, onSelect }: SidebarProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <motion.aside
      initial={false}
      animate={{ width: expanded ? 200 : 68 }}
      transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
      aria-expanded={expanded}
      className="flex shrink-0 flex-col border-r border-black/10 dark:border-white/5 bg-[#F8F9FA] dark:bg-[#1A1A1A] relative z-20 overflow-hidden"
    >
      {/* Brand - clicks to Dashboard */}
      <div className="flex h-14 items-center gap-2.5 px-4 border-b border-black/5 dark:border-white/5">
        <button
          type="button"
          onClick={() => onSelect('home')}
          className={[
            'flex items-center gap-2.5 transition-opacity hover:opacity-80',
            activeView === 'home' ? 'opacity-100' : '',
          ].join(' ')}
          title="RamN AI Dashboard"
        >
          <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-gray-900 dark:text-white">
            <RamanIcon size={28} />
            <span className="absolute -top-1 -right-2 text-[5px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 border border-slate-600 dark:border-slate-500 rounded px-0.5 bg-white/80 dark:bg-black/40 backdrop-blur-sm">Beta</span>
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
                <span className="text-[11px] font-black text-gray-900 dark:text-white whitespace-nowrap tracking-[0.2em]">RamN AI</span>
              </motion.div>
            )}
          </AnimatePresence>
        </button>
      </div>

      {/* Main navigation */}
      <nav aria-label="Main navigation" className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto custom-scrollbar">
        {mainNavItems.map((item) => (
          <NavButton
            key={item.id}
            id={item.id}
            label={item.label}
            icon={item.icon}
            active={item.id === activeView}
            expanded={expanded}
            onSelect={onSelect}
          />
        ))}
      </nav>

      {/* Bottom section: Settings + Profile + Collapse */}
      <div className="px-2 pb-3 space-y-0.5">
        <NavButton
          id="settings"
          label="SETTINGS"
          icon={Settings2}
          active={activeView === 'settings'}
          expanded={expanded}
          onSelect={onSelect}
        />

        {/* User profile indicator */}
        <button
          type="button"
          className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-gray-500 dark:text-white/40 hover:text-gray-900 dark:hover:text-white/80 hover:bg-black/5 dark:hover:bg-white/5 transition-all duration-150"
          title="Profile"
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center">
            <User size={16} />
          </span>
        </button>

        {/* Collapse toggle */}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-gray-500 dark:text-white/40 hover:text-gray-900 dark:hover:text-white/80 hover:bg-black/5 dark:hover:bg-white/5 transition-all duration-150"
          title={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
          aria-label="Toggle sidebar"
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
                Collapse <Kbd>&#8984;</Kbd><Kbd>B</Kbd>
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>
    </motion.aside>
  );
}
