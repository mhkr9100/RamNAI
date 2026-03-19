import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  Settings2,
  User,
} from 'lucide-react';
import { RamanIcon } from './RamanIcon';
import { PrismIcon } from './icons/PrismIcon';
import { UserMapIcon } from './icons/UserMapIcon';
import { SpectrumIcon } from './icons/SpectrumIcon';
import { Kbd } from './ui';

export type ViewId = 'home' | 'prism' | 'chats' | 'spectrum' | 'work' | 'usermap' | 'settings';

interface SidebarProps {
  activeView: ViewId;
  onSelect: (view: ViewId) => void;
}

const mainNavItems: Array<{ id: ViewId; label: string; icon: React.ComponentType<{ size?: number }> }> = [
  { id: 'prism', label: 'PRISM', icon: PrismIcon },
  { id: 'usermap', label: 'USERMAP', icon: UserMapIcon },
  { id: 'chats', label: 'CHATS', icon: MessageSquare },
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
            className="relative z-10 whitespace-nowrap text-[11px] tracking-[0.06em] font-semibold"
          >
            {label}
          </motion.span>
        )}
      </AnimatePresence>
      {active && !expanded && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-brand" />
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
      className="flex shrink-0 flex-col border-r border-white/[0.06] bg-surface-0 relative z-20 overflow-hidden"
    >
      {/* Brand - clicks to Dashboard */}
      <div className="flex h-14 items-center gap-2.5 px-4 border-b border-white/[0.04]">
        <button
          type="button"
          onClick={() => onSelect('home')}
          className={[
            'flex items-center gap-2.5 transition-opacity hover:opacity-80',
            activeView === 'home' ? 'opacity-100' : '',
          ].join(' ')}
          title="RamN AI Dashboard"
        >
          <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/[0.10] bg-white/[0.04]">
            <RamanIcon size={18} />
            {activeView === 'home' && (
              <div className="absolute inset-0 rounded-xl bg-brand/10 border border-brand/20" />
            )}
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
                <span className="text-[11px] font-bold text-white/90 whitespace-nowrap tracking-wide">RAMN AI</span>
                <span className="text-[9px] font-medium text-brand-light whitespace-nowrap">BETA</span>
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

      {/* Bottom section: Spectrum + Settings + Profile + Collapse */}
      <div className="px-2 pb-3 space-y-0.5">
        <NavButton
          id="spectrum"
          label="SPECTRUM"
          icon={SpectrumIcon}
          active={activeView === 'spectrum'}
          expanded={expanded}
          onSelect={onSelect}
        />

        <div className="my-1.5 mx-2 border-t border-white/[0.04]" />

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
          className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-white/30 hover:text-white/55 hover:bg-white/[0.04] transition-all duration-150"
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
          className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-white/30 hover:text-white/55 hover:bg-white/[0.04] transition-all duration-150"
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
