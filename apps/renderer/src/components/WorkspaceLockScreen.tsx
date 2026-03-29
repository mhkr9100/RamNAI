import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Lock, ShieldCheck } from 'lucide-react';
import { Button, Input } from './ui';
import { AppLogo } from './AppLogo';

interface WorkspaceLockScreenProps {
  onUnlock: (password: string) => Promise<void>;
}

export function WorkspaceLockScreen({ onUnlock }: WorkspaceLockScreenProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!password.trim()) {
      setError('Enter your workspace password.');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      await onUnlock(password);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Incorrect password.');
      setPassword('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-full items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-[#0D0D0D] dark:to-[#1A1A1A]">
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
        className="w-full max-w-sm px-6"
      >
        <div className="text-center">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.1, type: 'spring', stiffness: 200, damping: 15 }}
            className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-200 dark:bg-white/5 ring-1 ring-gray-300 dark:ring-white/10"
          >
            <AppLogo size={36} />
          </motion.div>

          <h1 className="text-xl font-bold text-gray-900 dark:text-white">
            Raman AI Locked
          </h1>
          <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-white/40">
            Enter your password to unlock the encrypted workspace.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <div className="relative">
            <Input
              type="password"
              autoComplete="current-password"
              label="Raman AI Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              className="bg-white dark:bg-surface-1"
            />
            <div className="absolute right-3 top-8 text-gray-400 dark:text-white/20">
              <Lock size={14} />
            </div>
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="rounded-xl border border-red-200 dark:border-red-400/20 bg-red-50 dark:bg-red-400/10 px-4 py-3 text-sm text-red-700 dark:text-red-100"
            >
              {error}
            </motion.div>
          )}

          <Button
            type="submit"
            variant="brand"
            size="lg"
            fullWidth
            loading={loading}
            icon={<ShieldCheck size={16} />}
          >
            {loading ? 'Unlocking...' : 'Unlock'}
          </Button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-[11px] text-gray-400 dark:text-white/20">
            AES-256-GCM encrypted · Lost password = lost data
          </p>
        </div>
      </motion.div>
    </div>
  );
}
