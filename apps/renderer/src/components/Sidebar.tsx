import React from 'react';
import { Bot, BrainCircuit, FolderKanban, MessageSquareMore, Settings2, Sparkles } from 'lucide-react';
import { RamanIcon } from './RamanIcon';

export type ViewId = 'prism' | 'chats' | 'spectrum' | 'work' | 'usermap' | 'settings';

interface SidebarProps {
  activeView: ViewId;
  onSelect: (view: ViewId) => void;
}

const items: Array<{ id: ViewId; label: string; icon: React.ReactNode }> = [
  { id: 'prism', label: 'Prism', icon: <Sparkles size={18} /> },
  { id: 'chats', label: 'Chats', icon: <MessageSquareMore size={18} /> },
  { id: 'usermap', label: 'UserMap', icon: <BrainCircuit size={18} /> },
  { id: 'spectrum', label: 'Spectrum', icon: <Bot size={18} /> },
  { id: 'work', label: 'Work', icon: <FolderKanban size={18} /> }
];

export function Sidebar({ activeView, onSelect }: SidebarProps) {
  return (
    <aside className="flex w-20 shrink-0 flex-col items-center border-r border-white/6 bg-[#0b0d0f] py-6">
      <button type="button" onClick={() => onSelect('chats')} className="flex flex-col items-center gap-2 text-white transition hover:scale-[1.02]" title="RamN AI">
        <div className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5">
          <RamanIcon size={22} />
          <span className="absolute -right-2 -top-2 rounded-full border border-white/10 bg-[#0b0d0f] px-1.5 py-0.5 text-[7px] font-black uppercase tracking-[0.18em] text-white/60">
            Beta
          </span>
        </div>
        <span className="text-[8px] font-black uppercase tracking-[0.22em] text-white/85">RamN AI</span>
      </button>

      <nav className="mt-8 flex w-full flex-1 flex-col items-center gap-5">
        {items.map((item) => {
          const active = item.id === activeView;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              title={item.label}
              className={`flex w-full flex-col items-center gap-1 rounded-xl px-2 py-2 text-[8px] font-black uppercase tracking-[0.18em] transition ${
                active
                  ? 'text-white'
                  : 'text-white/42 hover:bg-white/6 hover:text-white/82'
              }`}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <button
        type="button"
        onClick={() => onSelect('settings')}
        title="Settings"
        className={`mt-2 flex w-full flex-col items-center gap-1 rounded-xl px-2 py-2 text-[8px] font-black uppercase tracking-[0.18em] transition ${
          activeView === 'settings'
            ? 'text-white'
            : 'text-white/42 hover:bg-white/6 hover:text-white/82'
        }`}
      >
        <Settings2 size={18} />
        <span>Settings</span>
      </button>
    </aside>
  );
}
