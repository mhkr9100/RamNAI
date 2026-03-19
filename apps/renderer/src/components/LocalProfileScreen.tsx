import React, { useState } from 'react';
import { motion } from 'framer-motion';
import type { LocalProfile } from '@/lib/electron';
import { RamanIcon } from './RamanIcon';
import { Button, Card, Input } from './ui';

export function LocalProfileScreen({
  onSave,
  isSaving,
}: {
  onSave: (profile: LocalProfile) => Promise<void>;
  isSaving: boolean;
}) {
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
    <div className="flex min-h-screen items-center justify-center bg-surface-0 px-6 py-10 text-white">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.24, ease: [0.4, 0, 0.2, 1] }}
        className="w-full max-w-md"
      >
        <Card
          variant="elevated"
          padding="lg"
          animate={false}
          className="w-full bg-surface-elevated shadow-elevated"
        >
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="flex flex-col items-center text-center">
              <div className="shadow-glow rounded-3xl bg-surface-2 p-4">
                <div className="flex h-20 w-20 items-center justify-center rounded-3xl border border-white/[0.08] bg-surface-3 text-brand-light">
                  <RamanIcon size={44} />
                </div>
              </div>
              <div className="mt-6">
                <h1 className="font-display text-2xl font-bold text-white">RamN AI</h1>
                <p className="mt-2 text-sm text-white/60">AI agents made simple.</p>
              </div>
            </div>

            <div className="space-y-4">
              <Input
                label="Name"
                inputSize="lg"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Hemanth"
              />
              <Input
                label="Email"
                inputSize="lg"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
              />
            </div>

            {error ? (
              <div className="rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">
                {error}
              </div>
            ) : null}

            <Button type="submit" variant="brand" size="lg" fullWidth loading={isSaving}>
              {isSaving ? 'Entering Raman AI...' : 'Enter Raman AI'}
            </Button>
          </form>
        </Card>
      </motion.div>
    </div>
  );
}
