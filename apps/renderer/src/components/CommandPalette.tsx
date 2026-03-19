import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bot,
  BrainCircuit,
  FolderKanban,
  MessageSquareMore,
  Search,
  Settings2,
  Sparkles,
  ArrowRight,
} from 'lucide-react';
import { Kbd } from './ui';
import type { ViewId } from './Sidebar';

export interface CommandItem {
  id: string;
  label: string;
  description?: string;
  icon: React.ReactNode;
  group: string;
  keywords?: string[];
  shortcut?: string[];
  action: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  items: CommandItem[];
}

export function CommandPalette({ open, onClose, items }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.description?.toLowerCase().includes(q) ||
        item.group.toLowerCase().includes(q) ||
        item.keywords?.some((k) => k.toLowerCase().includes(q)),
    );
  }, [items, query]);

  const grouped = useMemo(() => {
    const groups: Record<string, CommandItem[]> = {};
    for (const item of filtered) {
      (groups[item.group] ??= []).push(item);
    }
    return Object.entries(groups);
  }, [filtered]);

  const flatItems = useMemo(() => filtered, [filtered]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const execute = useCallback(
    (item: CommandItem) => {
      item.action();
      onClose();
    },
    [onClose],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, flatItems.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (flatItems[selectedIndex]) execute(flatItems[selectedIndex]!);
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    },
    [flatItems, selectedIndex, execute, onClose],
  );

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${selectedIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm"
            onClick={onClose}
            aria-label="Close"
          />

          {/* Palette */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -8 }}
            transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
            className="fixed inset-x-0 top-[15%] z-[80] mx-auto w-full max-w-lg"
          >
            <div role="dialog" aria-modal="true" aria-label="Command palette" className="mx-4 overflow-hidden rounded-2xl border border-white/[0.10] bg-surface-3/95 shadow-[0_16px_48px_rgba(0,0,0,0.6)] backdrop-blur-xl">
              {/* Search */}
              <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-3">
                <Search size={16} className="shrink-0 text-white/30" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  role="combobox"
                  aria-expanded={true}
                  aria-controls="command-palette-listbox"
                  aria-activedescendant={flatItems[selectedIndex] ? `command-option-${flatItems[selectedIndex]!.id}` : undefined}
                  className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/25"
                  placeholder="Search commands..."
                />
                <Kbd>esc</Kbd>
              </div>

              {/* Results */}
              <div
                ref={listRef}
                id="command-palette-listbox"
                role="listbox"
                className="max-h-[360px] overflow-y-auto custom-scrollbar py-2"
              >
                {flatItems.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-white/30">
                    No results for "{query}"
                  </div>
                ) : (
                  grouped.map(([group, groupItems]) => (
                    <div key={group}>
                      <div className="px-4 pb-1.5 pt-3 text-[10px] font-semibold uppercase tracking-[0.06em] text-white/25">
                        {group}
                      </div>
                      {groupItems.map((item) => {
                        const globalIndex = flatItems.indexOf(item);
                        const isSelected = globalIndex === selectedIndex;
                        return (
                          <button
                            key={item.id}
                            id={`command-option-${item.id}`}
                            data-index={globalIndex}
                            type="button"
                            role="option"
                            aria-selected={isSelected}
                            onClick={() => execute(item)}
                            onMouseEnter={() => setSelectedIndex(globalIndex)}
                            className={[
                              'flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors duration-75',
                              isSelected
                                ? 'bg-brand/[0.10] text-white'
                                : 'text-white/70 hover:bg-white/[0.04]',
                            ].join(' ')}
                          >
                            <span className={`shrink-0 ${isSelected ? 'text-brand-light' : 'text-white/35'}`}>
                              {item.icon}
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className="text-[13px] font-medium truncate">{item.label}</div>
                              {item.description && (
                                <div className="text-[11px] text-white/35 truncate">
                                  {item.description}
                                </div>
                              )}
                            </div>
                            {item.shortcut && (
                              <span className="flex items-center gap-0.5 shrink-0">
                                {item.shortcut.map((k, i) => (
                                  <Kbd key={i}>{k}</Kbd>
                                ))}
                              </span>
                            )}
                            {isSelected && (
                              <ArrowRight size={13} className="shrink-0 text-brand-light" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  ))
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between border-t border-white/[0.06] px-4 py-2 text-[10px] text-white/20">
                <span>{flatItems.length} command{flatItems.length !== 1 ? 's' : ''}</span>
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1">
                    <Kbd>↑</Kbd><Kbd>↓</Kbd> navigate
                  </span>
                  <span className="flex items-center gap-1">
                    <Kbd>↵</Kbd> select
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export function buildDefaultCommands(navigate: (view: ViewId) => void): CommandItem[] {
  return [
    {
      id: 'nav-prism',
      label: 'Go to Prism',
      description: 'AI architect workspace',
      icon: <Sparkles size={16} />,
      group: 'Navigation',
      keywords: ['ask', 'create', 'architect'],
      shortcut: ['⌘', '1'],
      action: () => navigate('prism'),
    },
    {
      id: 'nav-chats',
      label: 'Go to Chats',
      description: 'Agent conversations',
      icon: <MessageSquareMore size={16} />,
      group: 'Navigation',
      keywords: ['messages', 'conversation', 'talk'],
      shortcut: ['⌘', '2'],
      action: () => navigate('chats'),
    },
    {
      id: 'nav-usermap',
      label: 'Go to UserMap',
      description: 'Context memory tree',
      icon: <BrainCircuit size={16} />,
      group: 'Navigation',
      keywords: ['memory', 'context', 'profile', 'tree'],
      shortcut: ['⌘', '3'],
      action: () => navigate('usermap'),
    },
    {
      id: 'nav-spectrum',
      label: 'Go to Spectrum',
      description: 'Agent and group management',
      icon: <Bot size={16} />,
      group: 'Navigation',
      keywords: ['agents', 'bots', 'groups'],
      shortcut: ['⌘', '4'],
      action: () => navigate('spectrum'),
    },
    {
      id: 'nav-work',
      label: 'Go to Work',
      description: 'Tasks and results',
      icon: <FolderKanban size={16} />,
      group: 'Navigation',
      keywords: ['tasks', 'results', 'artifacts', 'schedule'],
      shortcut: ['⌘', '5'],
      action: () => navigate('work'),
    },
    {
      id: 'nav-settings',
      label: 'Go to Settings',
      description: 'Runtime and provider configuration',
      icon: <Settings2 size={16} />,
      group: 'Navigation',
      keywords: ['config', 'ollama', 'provider', 'api key'],
      shortcut: ['⌘', ','],
      action: () => navigate('settings'),
    },
  ];
}
