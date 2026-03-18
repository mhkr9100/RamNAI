import React, { useState } from 'react';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { RamanIcon } from './RamanIcon';
import type { LocalProfile } from '@/lib/electron';

export function LocalProfileScreen({ onSave, isSaving }: { onSave: (profile: LocalProfile) => Promise<void>; isSaving: boolean }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !email.trim()) {
      setError('Name and email are required.');
      return;
    }

    setError(null);
    await onSave({ name: name.trim(), email: email.trim() });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#08090a] px-6 py-10 text-white">
      <div className="grid w-full max-w-6xl overflow-hidden rounded-[36px] border border-white/10 bg-[#0e1012] shadow-[0_40px_120px_rgba(0,0,0,0.45)] lg:grid-cols-[1.15fr_0.85fr]">
        <div className="relative overflow-hidden border-b border-white/8 p-8 lg:border-b-0 lg:border-r lg:p-12">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.08),transparent_42%),radial-gradient(circle_at_bottom_right,rgba(110,231,183,0.10),transparent_28%)]" />
          <div className="relative flex h-full flex-col justify-between gap-10">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/6 text-white">
                <RamanIcon size={34} />
              </div>
              <div>
                <div className="font-display text-xl font-semibold">Supreme Raman AI</div>
                <div className="text-xs uppercase tracking-[0.24em] text-white/40">Desktop-First AI Workspace</div>
              </div>
            </div>
            <div className="space-y-6">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.22em] text-emerald-200">
                <ShieldCheck size={14} />
                Private By Default
              </div>
              <h1 className="max-w-2xl font-display text-4xl font-semibold leading-tight text-white lg:text-5xl">
                Prism designs the work. Local runtime executes it. Your data stays on your machine.
              </h1>
              <p className="max-w-2xl text-base leading-8 text-white/62">
                Supreme Raman AI combines RamN’s product layer with a local-first execution engine. Chat with Prism, build chatbots, run scheduled work, and maintain your UserMap without a cloud account.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {[
                ['Prism', 'Creates agent specs and task plans from one natural-language goal.'],
                ['Work', 'Stores autonomous task runs, council outputs, and local artifacts.'],
                ['UserMap', 'Keeps editable private memory plus extracted context on your laptop.']
              ].map(([title, body]) => (
                <div key={title} className="rounded-3xl border border-white/8 bg-white/5 p-5">
                  <div className="mb-2 text-[11px] font-black uppercase tracking-[0.18em] text-white">{title}</div>
                  <p className="text-sm leading-6 text-white/55">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="p-8 lg:p-12">
          <form onSubmit={handleSubmit} className="mx-auto flex h-full max-w-md flex-col justify-center gap-6">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.22em] text-white/40">Local profile</div>
              <h2 className="mt-3 text-3xl font-semibold text-white">Create your local workspace identity</h2>
              <p className="mt-3 text-sm leading-7 text-white/55">
                No password. No cloud account. Your local profile unlocks Prism, Work, Groups, and UserMap on this device.
              </p>
            </div>
            <label className="space-y-2">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/42">Name</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-4 text-sm text-white outline-none transition focus:border-white/25"
                placeholder="Hemanth"
              />
            </label>
            <label className="space-y-2">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/42">Email</span>
              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-4 text-sm text-white outline-none transition focus:border-white/25"
                placeholder="you@example.com"
                type="email"
              />
            </label>
            {error ? <div className="rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">{error}</div> : null}
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center justify-center gap-3 rounded-2xl bg-white px-5 py-4 text-[11px] font-black uppercase tracking-[0.22em] text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? 'Creating Workspace…' : 'Enter Raman AI'}
              <ArrowRight size={16} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
