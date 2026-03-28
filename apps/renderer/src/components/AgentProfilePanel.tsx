import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Bot, MessageSquare, Send } from 'lucide-react';
import type { AgentSpec } from '@workspace/shared';
import { Badge, Button, Card, Divider, SectionLabel } from './ui';

interface AgentProfilePanelProps {
  agent: AgentSpec | null;
  open: boolean;
  onClose: () => void;
  onOpenChat?: (agentId: string) => void;
  onUpdateProfile?: (agentId: string, updates: {
    name?: string;
    systemPrompt?: string;
    capabilities?: string[];
  }) => Promise<void>;
  onDeleteAgent?: (agentId: string) => Promise<void>;
}

const CAPABILITY_LABELS: Record<string, { label: string; color: string }> = {
  web_search: { label: 'WEB SEARCH', color: 'bg-[#38bdf8]/10 text-[#38bdf8] border-[#38bdf8]/20' },
  thinking: { label: 'THINKING', color: 'bg-[#a78bfa]/10 text-[#a78bfa] border-[#a78bfa]/20' },
  code_execution: { label: 'CODE EXECUTION', color: 'bg-[#34d399]/10 text-[#34d399] border-[#34d399]/20' },
  file_management: { label: 'FILE MANAGEMENT', color: 'bg-[#fbbf24]/10 text-[#fbbf24] border-[#fbbf24]/20' },
  shell: { label: 'SHELL', color: 'bg-[#f87171]/10 text-[#f87171] border-[#f87171]/20' },
  browser: { label: 'BROWSER', color: 'bg-[#60a5fa]/10 text-[#60a5fa] border-[#60a5fa]/20' },
  api_calls: { label: 'API CALLS', color: 'bg-[#c084fc]/10 text-[#c084fc] border-[#c084fc]/20' },
  mcp: { label: 'MCP', color: 'bg-[#2dd4bf]/10 text-[#2dd4bf] border-[#2dd4bf]/20' },
};

function getCapabilityStyle(cap: string) {
  const normalized = cap.toLowerCase().replace(/[\s-]+/g, '_');
  return CAPABILITY_LABELS[normalized] ?? {
    label: cap.toUpperCase(),
    color: 'bg-black/[0.04] text-slate-600 border-black/8 dark:bg-white/[0.06] dark:text-white/60 dark:border-white/[0.08]',
  };
}

export function AgentProfilePanel({
  agent,
  open,
  onClose,
  onOpenChat,
  onUpdateProfile,
  onDeleteAgent,
}: AgentProfilePanelProps) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editSystemPrompt, setEditSystemPrompt] = useState('');

  const handleStartEdit = () => {
    if (!agent) return;
    setEditName(agent.name);
    setEditSystemPrompt(agent.persona.systemInstructions ?? agent.persona.role ?? '');
    setEditing(true);
  };

  const handleSave = async () => {
    if (!agent || !onUpdateProfile) return;
    await onUpdateProfile(agent.id, {
      name: editName.trim(),
      systemPrompt: editSystemPrompt.trim(),
    });
    setEditing(false);
  };

  const allCapabilities = agent
    ? [...(agent.tools ?? []), ...(agent.skills ?? [])]
    : [];

  return (
    <AnimatePresence>
      {open && agent && (
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
            className="fixed right-0 top-0 z-[60] flex h-full w-full max-w-md flex-col border-l border-black/8 bg-surface-1 shadow-2xl dark:border-white/[0.08]"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-black/8 px-5 py-4 dark:border-white/[0.06]">
              <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">Profile</h2>
              <button
                type="button"
                onClick={onClose}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-black/[0.05] hover:text-slate-700 dark:text-white/40 dark:hover:bg-white/[0.06] dark:hover:text-white/70"
                aria-label="Close profile"
              >
                <X size={16} />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar px-5 py-5 space-y-5">
              {/* Agent identity */}
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-black/8 bg-surface-3 dark:border-white/[0.08]">
                  <Bot size={22} className="text-brand-light" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.04em] text-brand-light">
                    {agent.persona.role.toUpperCase()}
                  </div>
                  <p className="mt-0.5 truncate text-sm text-slate-500 dark:text-white/50">{agent.description || 'No description'}</p>
                </div>
              </div>

              {/* Agent Name */}
              <div>
                <SectionLabel className="mb-2">AGENT NAME</SectionLabel>
                <Card className="bg-surface-3 p-4">
                  {editing ? (
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full bg-transparent text-[15px] font-semibold text-slate-900 outline-none dark:text-white"
                    />
                  ) : (
                    <p className="text-[15px] font-semibold text-slate-900 dark:text-white">{agent.name}</p>
                  )}
                </Card>
              </div>

              {/* Runtime & Capabilities row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <SectionLabel className="mb-2">RUNTIME MODEL</SectionLabel>
                  <Card className="bg-surface-3 p-4">
                    <p className="text-sm text-slate-600 dark:text-white/70">
                      {agent.providerStrategy.mode === 'fixed'
                        ? `${agent.providerStrategy.provider}:${agent.providerStrategy.modelId}`
                        : agent.providerStrategy.mode === 'user_override'
                          ? `${agent.providerStrategy.defaultProvider}:${agent.providerStrategy.defaultModelId}`
                          : 'auto (local first)'}
                    </p>
                  </Card>
                </div>
                <div>
                  <SectionLabel className="mb-2">CAPABILITIES</SectionLabel>
                <Card className="bg-surface-3 p-4">
                    <p className="text-sm text-slate-600 dark:text-white/70">{allCapabilities.length}</p>
                  </Card>
                </div>
              </div>

              <Divider />

              {/* System Instructions */}
              <div>
                <SectionLabel className="mb-2">SYSTEM INSTRUCTIONS</SectionLabel>
                <Card className="bg-surface-3 p-4">
                  {editing ? (
                    <textarea
                      value={editSystemPrompt}
                      onChange={(e) => setEditSystemPrompt(e.target.value)}
                      rows={8}
                      className="w-full resize-none bg-transparent text-sm leading-relaxed text-slate-700 outline-none placeholder:text-slate-400 dark:text-white/80 dark:placeholder:text-white/25"
                      placeholder="Enter system instructions..."
                    />
                  ) : (
                    <div className="max-h-[200px] overflow-y-auto custom-scrollbar">
                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-600 dark:text-white/70">
                        {agent.persona.systemInstructions || agent.persona.role || 'No system instructions configured.'}
                      </p>
                    </div>
                  )}
                </Card>
              </div>

              <Divider />

              {/* Capabilities (Skills/Tools) */}
              <div>
                <SectionLabel className="mb-3">AGENT CAPABILITIES</SectionLabel>
                {allCapabilities.length === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-white/40">No capabilities configured.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {allCapabilities.map((cap) => {
                      const style = getCapabilityStyle(cap);
                      return (
                        <span
                          key={cap}
                          className={`inline-flex items-center rounded-lg border px-3 py-1.5 text-[11px] font-semibold tracking-[0.04em] ${style.color}`}
                        >
                          {style.label}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>

              <Divider />

              {/* Provider Strategy */}
              <div>
                <SectionLabel className="mb-3">PROVIDER STRATEGY</SectionLabel>
                <div className="space-y-2">
                  <InfoRow label="Mode" value={agent.providerStrategy.mode.replace(/_/g, ' ')} />
                  {agent.providerStrategy.mode === 'fixed' && (
                    <>
                      <InfoRow label="Provider" value={agent.providerStrategy.provider} />
                      <InfoRow label="Model" value={agent.providerStrategy.modelId} />
                    </>
                  )}
                  {agent.providerStrategy.mode === 'local_first' && agent.providerStrategy.preferredLocalModelIds && (
                    <InfoRow label="Preferred" value={agent.providerStrategy.preferredLocalModelIds.join(', ')} />
                  )}
                </div>
              </div>

              {/* Channels placeholder */}
              {agent.persona.role?.toLowerCase().includes('coordinator') && (
                <>
                  <Divider />
                  <div>
                    <SectionLabel className="mb-3">CHANNELS</SectionLabel>
                    <div className="space-y-2">
                      {['WhatsApp', 'Telegram', 'Discord', 'Slack', 'iMessage'].map((channel) => (
                        <div key={channel} className="flex items-center justify-between rounded-xl border border-black/8 bg-surface-3 px-4 py-2.5 dark:border-white/[0.06]">
                          <div className="flex items-center gap-2.5">
                            <MessageSquare size={14} className="text-slate-400 dark:text-white/35" />
                            <span className="text-sm text-slate-600 dark:text-white/60">{channel}</span>
                          </div>
                          <Badge variant="outline" size="xs">Configure</Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Footer actions */}
            <div className="space-y-2 border-t border-black/8 px-5 py-4 dark:border-white/[0.06]">
              {editing ? (
                <div className="flex gap-2">
                  <Button variant="brand" size="lg" fullWidth onClick={() => void handleSave()}>
                    Save Changes
                  </Button>
                  <Button variant="secondary" size="lg" onClick={() => setEditing(false)}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  {onUpdateProfile && (
                    <Button variant="secondary" size="lg" fullWidth onClick={handleStartEdit}>
                      UPDATE PROFILE
                    </Button>
                  )}
                  {onDeleteAgent && (
                    <Button
                      variant="danger"
                      size="lg"
                      onClick={async () => {
                        await onDeleteAgent(agent.id);
                        onClose();
                      }}
                    >
                      Delete Agent
                    </Button>
                  )}
                  {onOpenChat && (
                    <Button
                      variant="brand"
                      size="lg"
                      fullWidth
                      icon={<Send size={14} />}
                      onClick={() => onOpenChat(agent.id)}
                    >
                      Open Chat
                    </Button>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-black/8 bg-surface-3 px-4 py-2.5 dark:border-white/[0.06]">
      <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-slate-500 dark:text-white/40">{label}</span>
      <span className="text-sm text-slate-600 dark:text-white/70">{value}</span>
    </div>
  );
}
