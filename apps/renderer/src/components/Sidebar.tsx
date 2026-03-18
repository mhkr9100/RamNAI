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
    <aside className="flex w-[74px] shrink-0 flex-col items-center border-r border-white/6 bg-[#090b0d] py-5">
      <button type="button" onClick={() => onSelect('chats')} className="flex flex-col items-center gap-1.5 text-white transition hover:scale-[1.02]" title="RamN AI">
        <div className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5">
          <RamanIcon size={20} />
          <span className="absolute -right-2 -top-2 rounded-full border border-white/10 bg-[#0b0d0f] px-1.5 py-0.5 text-[7px] font-black uppercase tracking-[0.18em] text-white/60">
            Beta
          </span>
        </div>
        <span className="text-[7px] font-black uppercase tracking-[0.18em] text-white/78">RamN AI</span>
      </button>

      <nav className="mt-7 flex w-full flex-1 flex-col items-center gap-3">
        {items.map((item) => {
          const active = item.id === activeView;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              title={item.label}
              className={`flex w-full flex-col items-center gap-1 rounded-xl px-2 py-2 text-[7px] font-black uppercase tracking-[0.16em] transition ${
                active
                  ? 'text-white'
                  : 'text-white/42 hover:bg-white/6 hover:text-white/82'
              }`}
            >
              <div className={`rounded-lg border px-2 py-2 transition ${active ? 'border-white/12 bg-white/10' : 'border-transparent bg-transparent'}`}>
                {item.icon}
              </div>
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <button
        type="button"
        onClick={() => onSelect('settings')}
        title="Settings"
        className={`mt-2 flex w-full flex-col items-center gap-1 rounded-xl px-2 py-2 text-[7px] font-black uppercase tracking-[0.16em] transition ${
          activeView === 'settings'
            ? 'text-white'
            : 'text-white/42 hover:bg-white/6 hover:text-white/82'
        }`}
      >
        <div className={`rounded-lg border px-2 py-2 transition ${activeView === 'settings' ? 'border-white/12 bg-white/10' : 'border-transparent bg-transparent'}`}>
          <Settings2 size={18} />
        </div>
        <span>Settings</span>
      </button>
    </aside>
  );
}
