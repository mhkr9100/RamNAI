import React, { useState } from 'react';
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
      <form
        onSubmit={handleSubmit}
        className="flex w-full max-w-sm flex-col items-center rounded-3xl border border-white/10 bg-[#0d1012] px-7 py-8 shadow-[0_32px_96px_rgba(0,0,0,0.42)]"
      >
        <div className="flex h-20 w-20 items-center justify-center rounded-3xl border border-white/10 bg-white/5 text-white">
          <RamanIcon size={44} />
        </div>
        <div className="mt-6 text-center">
          <h1 className="text-2xl font-semibold text-white">RamN AI &quot;Beta&quot;</h1>
          <p className="mt-2 text-sm text-white/60">AI Agents made Simple</p>
        </div>

        <div className="mt-8 w-full space-y-4">
          <label className="block space-y-2">
            <span className="text-xs font-bold uppercase tracking-[0.22em] text-white/42">Name</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none transition focus:border-white/25"
              placeholder="Hemanth"
            />
          </label>
          <label className="block space-y-2">
            <span className="text-xs font-bold uppercase tracking-[0.22em] text-white/42">Email</span>
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none transition focus:border-white/25"
              placeholder="you@example.com"
              type="email"
            />
          </label>
        </div>

        {error ? <div className="mt-4 w-full rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">{error}</div> : null}

        <button
          type="submit"
          disabled={isSaving}
          className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-white px-5 py-3 text-[10px] font-black uppercase tracking-[0.18em] text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSaving ? 'Entering Raman AI…' : 'Enter Raman AI'}
        </button>
      </form>
    </div>
  );
}
