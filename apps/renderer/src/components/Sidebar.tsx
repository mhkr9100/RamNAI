import React from 'react';
import { Bot, BrainCircuit, FolderKanban, Layers3, MessageSquareMore, Sparkles } from 'lucide-react';
import { RamanIcon } from './RamanIcon';

export type ViewId = 'prism' | 'chats' | 'spectrum' | 'work' | 'usermap';

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
    <aside className="w-[86px] shrink-0 border-r border-white/6 bg-[#0b0d0f] px-3 py-4 flex flex-col items-center gap-5">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white">
        <RamanIcon size={26} />
      </div>
      <div className="flex flex-col items-center gap-3">
        {items.map((item) => {
          const active = item.id === activeView;
          return (
            <button
              key={item.id}
              onClick={() => onSelect(item.id)}
              className={`flex w-full flex-col items-center gap-1 rounded-2xl px-2 py-3 text-[9px] font-black uppercase tracking-[0.18em] transition ${
                active
                  ? 'bg-white text-black shadow-[0_12px_40px_rgba(255,255,255,0.12)]'
                  : 'bg-transparent text-white/45 hover:bg-white/6 hover:text-white/80'
              }`}
              title={item.label}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white/40">
        <Layers3 size={18} />
      </div>
    </aside>
  );
}
