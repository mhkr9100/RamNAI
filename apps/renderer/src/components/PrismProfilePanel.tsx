import React, { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Sparkles,
  MessageSquare,
  Shield,
  Globe,
  Zap,
  Terminal,
  Wrench,
  Loader2,
  Trash2,
  Send,
} from 'lucide-react';
import type {
  PrismProviderOverrideSettings,
  ProviderId,
  ProviderModelPreset,
} from '@supreme/shared';
import { getDesktopApi } from '@/lib/electron';
import { Badge, Button, Card, Divider, SectionLabel, Select, Input } from './ui';

interface ChannelEntry {
  id: string;
  provider: string;
  enabled: boolean;
  accountName: string;
}

interface PrismProfilePanelProps {
  open: boolean;
  onClose: () => void;
  prismOverride: PrismProviderOverrideSettings | null;
  models: ProviderModelPreset[];
  onSavePrismOverride: (override: PrismProviderOverrideSettings | null) => Promise<void>;
  busy: boolean;
  /** Whether runtime bridge is available for channels */
  bridgeAvailable?: boolean;
}

const PRISM_CAPABILITIES = [
  { label: 'Web Search', icon: Globe },
  { label: 'Thinking', icon: Sparkles },
  { label: 'Code Execution', icon: Terminal },
  { label: 'File Management', icon: Wrench },
  { label: 'Agent Orchestration', icon: Zap },
  { label: 'Safety Guardrails', icon: Shield },
];

const PROVIDER_OPTIONS = [
  { value: 'ollama', label: 'Ollama (Local)' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'google', label: 'Google' },
];

const TELEGRAM_CHANNEL_ID = 'telegram';

export function PrismProfilePanel({
  open,
  onClose,
  prismOverride,
  models,
  onSavePrismOverride,
  busy,
  bridgeAvailable = false,
}: PrismProfilePanelProps) {
  const [overrideProvider, setOverrideProvider] = useState<ProviderId>('ollama');
  const [overrideModelId, setOverrideModelId] = useState('');
  const [channels, setChannels] = useState<ChannelEntry[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(false);
  const [telegramToken, setTelegramToken] = useState('');
  const [channelAddLoading, setChannelAddLoading] = useState(false);
  const [channelError, setChannelError] = useState<string | null>(null);

  const installedModels = models.filter((m) => m.installed);

  const refreshChannels = useCallback(() => {
    setChannelsLoading(true);
    getDesktopApi()
      .bridge.listChannels()
      .then((list: ChannelEntry[]) => setChannels(list))
      .catch(() => setChannels([]))
      .finally(() => setChannelsLoading(false));
  }, []);

  useEffect(() => {
    if (!open) return;
    refreshChannels();
  }, [open, refreshChannels]);

  useEffect(() => {
    if (prismOverride) {
      setOverrideProvider(prismOverride.provider);
      setOverrideModelId(prismOverride.modelId);
      return;
    }
    setOverrideProvider('ollama');
    setOverrideModelId(installedModels[0]?.id ?? '');
  }, [prismOverride, installedModels]);

  const localModelOptions = installedModels.length === 0
    ? [{ value: '', label: 'No local models installed' }]
    : installedModels.map((m) => ({ value: m.id, label: `${m.label} / ${m.id}` }));

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!overrideModelId.trim()) return;
    await onSavePrismOverride({ provider: overrideProvider, modelId: overrideModelId.trim() });
  };

  const handleAddTelegram = async (event: React.FormEvent) => {
    event.preventDefault();
    const token = telegramToken.trim();
    if (!token) return;
    setChannelError(null);
    setChannelAddLoading(true);
    try {
      const ok = await getDesktopApi().bridge.addChannel(TELEGRAM_CHANNEL_ID, token);
      if (ok) {
        setTelegramToken('');
        refreshChannels();
      } else {
        setChannelError('Failed to add Telegram. Ensure the runtime bridge is installed and running.');
      }
    } catch (e) {
      setChannelError(e instanceof Error ? e.message : 'Failed to connect Telegram.');
    } finally {
      setChannelAddLoading(false);
    }
  };

  const handleRemoveChannel = async (channelId: string) => {
    setChannelError(null);
    try {
      const ok = await getDesktopApi().bridge.removeChannel(channelId);
      if (ok) refreshChannels();
    } catch {
      setChannelError('Failed to remove channel.');
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm"
            onClick={onClose}
          />

          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            className="fixed right-0 top-0 z-[60] flex h-full w-full max-w-md flex-col border-l border-white/[0.08] bg-surface-1 shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
              <h2 className="text-[15px] font-semibold text-white">Prism Profile</h2>
              <button
                type="button"
                onClick={onClose}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-white/40 hover:bg-white/[0.06] hover:text-white/70 transition-colors"
                aria-label="Close profile"
              >
                <X size={16} />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar px-5 py-5 space-y-5">
              {/* Identity */}
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-brand/20 bg-brand/10">
                  <Sparkles size={22} className="text-brand-light" />
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.04em] text-brand-light">
                    META ARCHITECT
                  </div>
                  <h3 className="text-lg font-semibold text-white">Prism</h3>
                </div>
              </div>

              <Divider />

              {/* System Instructions */}
              <div>
                <SectionLabel className="mb-2">SYSTEM INSTRUCTIONS</SectionLabel>
                <Card className="bg-surface-3 p-4">
                  <p className="text-sm leading-relaxed text-white/70">
                    Prism is the meta-architect of RamN AI. It designs agent blueprints, orchestrates
                    multi-agent workflows, analyzes UserMap context, and provides strategy for building
                    focused AI assistants. Prism has full access to the workspace state and can create
                    agents, schedule tasks, and run council sessions.
                  </p>
                </Card>
              </div>

              <Divider />

              {/* Model Routing */}
              <div>
                <SectionLabel className="mb-3">MODEL ROUTING</SectionLabel>
                <form onSubmit={handleSave} className="space-y-4">
                  <Card className="bg-surface-3 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-white/40">
                        Current
                      </span>
                      <Badge variant={prismOverride ? 'brand' : 'default'}>
                        {prismOverride ? `${prismOverride.provider} / ${prismOverride.modelId}` : 'Automatic'}
                      </Badge>
                    </div>
                  </Card>

                  <Select
                    label="Provider"
                    value={overrideProvider}
                    onChange={(e) => {
                      const provider = e.target.value as ProviderId;
                      setOverrideProvider(provider);
                      if (provider === 'ollama' && installedModels[0]) {
                        setOverrideModelId((c) => c || installedModels[0]!.id);
                      }
                    }}
                    options={PROVIDER_OPTIONS}
                  />

                  {overrideProvider === 'ollama' ? (
                    <Select
                      label="Local Model"
                      value={overrideModelId}
                      onChange={(e) => setOverrideModelId(e.target.value)}
                      options={localModelOptions}
                    />
                  ) : (
                    <Input
                      label="Model ID"
                      value={overrideModelId}
                      onChange={(e) => setOverrideModelId(e.target.value)}
                      placeholder={
                        overrideProvider === 'openai' ? 'gpt-5.4-mini'
                          : overrideProvider === 'anthropic' ? 'claude-sonnet-4-5'
                            : 'gemini-2.5-pro'
                      }
                    />
                  )}

                  <div className="flex gap-2">
                    <Button type="submit" variant="brand" size="md" loading={busy} className="flex-1">
                      Save
                    </Button>
                    <Button type="button" variant="secondary" size="md" disabled={busy} onClick={() => void onSavePrismOverride(null)}>
                      Auto
                    </Button>
                  </div>
                </form>
              </div>

              <Divider />

              {/* Capabilities */}
              <div>
                <SectionLabel className="mb-3">PRISM CAPABILITIES</SectionLabel>
                <div className="flex flex-wrap gap-2">
                  {PRISM_CAPABILITIES.map((cap) => {
                    const Icon = cap.icon;
                    return (
                      <span
                        key={cap.label}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-brand/20 bg-brand/[0.06] px-3 py-1.5 text-[11px] font-semibold tracking-[0.04em] text-brand-light"
                      >
                        <Icon size={12} />
                        {cap.label.toUpperCase()}
                      </span>
                    );
                  })}
                </div>
              </div>

              <Divider />

              {/* Multi-channel messaging */}
              <div>
                <SectionLabel className="mb-3">CHANNELS</SectionLabel>
                <p className="text-[12px] text-white/35 mb-3">
                  Prism can communicate through Telegram and other platforms via the runtime bridge.
                </p>
                {!bridgeAvailable && (
                  <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                    Runtime bridge is not available. Install the CLI to connect messaging channels.
                  </div>
                )}
                {bridgeAvailable && (
                  <form onSubmit={handleAddTelegram} className="mb-4 space-y-2">
                    <Input
                      type="password"
                      label="Telegram bot token"
                      placeholder="From @BotFather"
                      value={telegramToken}
                      onChange={(e) => setTelegramToken(e.target.value)}
                      disabled={channelAddLoading || busy}
                    />
                    <Button
                      type="submit"
                      variant="secondary"
                      size="sm"
                      loading={channelAddLoading}
                      disabled={!telegramToken.trim() || busy}
                      icon={<Send size={14} />}
                    >
                      Connect Telegram
                    </Button>
                  </form>
                )}
                {channelError && (
                  <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                    {channelError}
                  </div>
                )}
                {channelsLoading ? (
                  <div className="flex items-center gap-2 py-4 justify-center text-white/30">
                    <Loader2 size={14} className="animate-spin" />
                    <span className="text-[12px]">Loading channels...</span>
                  </div>
                ) : channels.length === 0 ? (
                  <Card className="bg-surface-3 p-4">
                    <p className="text-[12px] text-white/35 text-center">
                      {bridgeAvailable
                        ? 'Add your Telegram bot token above to connect.'
                        : 'Install the runtime bridge to connect messaging platforms.'}
                    </p>
                  </Card>
                ) : (
                  <div className="space-y-2">
                    {channels.map((channel) => (
                      <div
                        key={channel.id}
                        className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-surface-3 px-4 py-2.5"
                      >
                        <div className="flex items-center gap-2.5">
                          <MessageSquare size={14} className="text-white/35" />
                          <span className="text-sm text-white/60">{channel.provider}</span>
                          {channel.accountName && (
                            <span className="text-[11px] text-white/25">{channel.accountName}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={channel.enabled ? 'brand' : 'default'} size="xs">
                            {channel.enabled ? 'Connected' : 'Disabled'}
                          </Badge>
                          {bridgeAvailable && (
                            <button
                              type="button"
                              onClick={() => void handleRemoveChannel(channel.id)}
                              className="rounded p-1.5 text-white/35 hover:bg-white/10 hover:text-white/70 transition-colors"
                              aria-label={`Remove ${channel.provider}`}
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
