import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Download, FlaskConical, KeyRound, Trash2 } from 'lucide-react';
import type {
  AgentMode,
  OllamaRuntimeStatus,
  PrismProviderOverrideSettings,
  ProviderAuthProfile,
  ProviderId,
  ProviderModelPreset,
} from '@supreme/shared';
import type { WorkspaceSecurityState } from '@/lib/electron';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  CardSection,
  Divider,
  Input,
  SectionLabel,
  Select,
  StatusDot,
} from './ui';

import type { TaskCreateInput, WorkspaceSnapshot } from '@/lib/electron';
import type { ChatTarget } from './ChatsWorkspace';
import { SpectrumView } from './SpectrumView';

type SettingsSection = 'runtime' | 'providers' | 'agents' | 'prism';
type RemoteProviderId = Exclude<ProviderId, 'ollama'>;

interface SettingsViewProps {
  activeSection: SettingsSection;
  onSelectSection: (section: SettingsSection) => void;
  runtimeReady: boolean;
  providerProfiles: ProviderAuthProfile[];
  providerSelections: Record<RemoteProviderId, string | null>;
  prismOverride: PrismProviderOverrideSettings | null;
  workspaceSecurity: WorkspaceSecurityState | null;
  agentMode: AgentMode;
  onSaveAgentMode: (mode: AgentMode) => Promise<void>;
  ollamaStatus: OllamaRuntimeStatus | null;
  models: ProviderModelPreset[];
  snapshot: WorkspaceSnapshot;
  busy: boolean;
  loading: boolean;
  onRefresh: () => Promise<void>;
  onInstallDefaults: () => Promise<void>;
  onSaveProfile: (input: {
    id?: string;
    provider: RemoteProviderId;
    label: string;
    description?: string;
    apiKey?: string;
    token?: string;
    isDefault?: boolean;
  }) => Promise<void>;
  onDeleteProfile: (profile: ProviderAuthProfile) => Promise<void>;
  onTestProfile: (profile: ProviderAuthProfile, probeWithRuntime?: boolean) => Promise<void>;
  onSetProviderSelection: (provider: RemoteProviderId, profileId: string | null) => Promise<void>;
  onSavePrismOverride: (override: PrismProviderOverrideSettings | null) => Promise<void>;
  onEnableWorkspaceEncryption: (password: string) => Promise<void>;
  onDisableWorkspaceEncryption: (password: string) => Promise<void>;
  onSaveScheduleTimezone: (timezone: string) => Promise<void>;
  onCreateAgentTask: (input: TaskCreateInput) => Promise<void>;
  onUpsertGroup: (group: { id?: string; name: string; description?: string; memberAgentIds: string[]; routingMode: 'auto' | 'manual'; autoRouteThreshold: number; defaultResponderAgentId?: string }) => Promise<void>;
  onDeleteGroup: (groupId: string) => Promise<void>;
  onOpenChat: (target: ChatTarget) => void;
}

const sections: Array<{ id: SettingsSection; label: string }> = [
  { id: 'runtime', label: 'Local' },
  { id: 'providers', label: 'Accounts' },
  { id: 'agents', label: 'Agents' },
  { id: 'prism', label: 'Prism' },
];

const listVariants = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.05,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0 },
};

export function SettingsView({
  activeSection,
  onSelectSection,
  runtimeReady,
  providerProfiles,
  providerSelections,
  prismOverride,
  workspaceSecurity,
  agentMode,
  onSaveAgentMode,
  ollamaStatus,
  models,
  snapshot,
  busy,
  loading,
  onRefresh,
  onInstallDefaults,
  onSaveProfile,
  onDeleteProfile,
  onTestProfile,
  onSetProviderSelection,
  onSavePrismOverride,
  onEnableWorkspaceEncryption,
  onDisableWorkspaceEncryption,
  onSaveScheduleTimezone,
  onCreateAgentTask,
  onUpsertGroup,
  onDeleteGroup,
  onOpenChat,
}: SettingsViewProps) {
  const providerRef = useRef<HTMLSelectElement | null>(null);
  const labelRef = useRef<HTMLInputElement | null>(null);
  const descriptionRef = useRef<HTMLTextAreaElement | null>(null);
  const apiKeyRef = useRef<HTMLInputElement | null>(null);
  const tokenRef = useRef<HTMLInputElement | null>(null);
  const defaultRef = useRef<HTMLInputElement | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [encryptionPassword, setEncryptionPassword] = useState('');
  const [encryptionConfirm, setEncryptionConfirm] = useState('');
  const [disablePassword, setDisablePassword] = useState('');
  const [securityError, setSecurityError] = useState<string | null>(null);

  const installedOllamaModels = useMemo(
    () => models.filter((model) => model.provider === 'ollama' && model.installed),
    [models],
  );

  const [prismOverrideProvider, setPrismOverrideProvider] = useState<ProviderId>(prismOverride?.provider ?? 'ollama');
  const [prismOverrideModelId, setPrismOverrideModelId] = useState<string>(prismOverride?.modelId ?? '');

  useEffect(() => {
    if (prismOverride) {
      setPrismOverrideProvider(prismOverride.provider);
      setPrismOverrideModelId(prismOverride.modelId);
      return;
    }

    setPrismOverrideProvider('ollama');
    setPrismOverrideModelId(installedOllamaModels[0]?.id ?? '');
  }, [prismOverride, installedOllamaModels]);

  const installedModelCount = useMemo(
    () => models.filter((model) => model.installed).length,
    [models],
  );

  const installedModels = useMemo(
    () => models.filter((model) => model.installed),
    [models],
  );

  const providerOptions = useMemo(
    () => REMOTE_PROVIDER_LABELS.map((provider) => ({ value: provider.id, label: provider.label })),
    [],
  );


  const handleSaveProfile = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const provider = providerRef.current?.value as RemoteProviderId | undefined;
    const label = labelRef.current?.value.trim() ?? '';
    const description = descriptionRef.current?.value.trim() ?? '';
    const apiKey = apiKeyRef.current?.value.trim() ?? '';
    const token = tokenRef.current?.value.trim() ?? '';
    const isDefault = defaultRef.current?.checked ?? false;

    if (!provider || !label) {
      setFormError('Provider and label are required.');
      return;
    }

    if (!apiKey && !token) {
      setFormError('Add at least one API key or token before saving.');
      return;
    }

    setFormError(null);

    await onSaveProfile({
      provider,
      label,
      ...(description ? { description } : {}),
      ...(apiKey ? { apiKey } : {}),
      ...(token ? { token } : {}),
      ...(isDefault ? { isDefault: true } : {}),
    });

    if (apiKeyRef.current) apiKeyRef.current.value = '';
    if (tokenRef.current) tokenRef.current.value = '';
  };

  const handleEnableEncryption = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!encryptionPassword.trim()) {
      setSecurityError('Enter a workspace password.');
      return;
    }
    if (encryptionPassword !== encryptionConfirm) {
      setSecurityError('Passwords do not match.');
      return;
    }

    setSecurityError(null);
    await onEnableWorkspaceEncryption(encryptionPassword);
    setEncryptionPassword('');
    setEncryptionConfirm('');
  };

  const handleDisableEncryption = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!disablePassword.trim()) {
      setSecurityError('Enter the current workspace password.');
      return;
    }

    setSecurityError(null);
    await onDisableWorkspaceEncryption(disablePassword);
    setDisablePassword('');
  };

  return (
    <div className="space-y-5">
      <Card variant="elevated" padding="lg" animate={false} className="bg-surface-2">
        <CardHeader
          title="Settings"
          action={
            <div className="flex flex-wrap gap-2">
              <Badge variant="brand">Local {runtimeReady ? 'Ready' : 'Check'}</Badge>
              <Badge variant="brand">Models {installedModelCount}</Badge>
              <Badge variant="brand">Accounts {providerProfiles.length}</Badge>
            </div>
          }
        />
      </Card>

      <section className="flex flex-wrap gap-2">
        {sections.map((section) => {
          const active = section.id === activeSection;
          return (
            <div key={section.id} className="relative">
              {active ? <span className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-brand" /> : null}
              <Button
                type="button"
                variant={active ? 'secondary' : 'ghost'}
                size="md"
                className={active ? 'pl-5' : ''}
                onClick={() => onSelectSection(section.id)}
              >
                {section.label}
              </Button>
            </div>
          );
        })}
      </section>

      {activeSection === 'runtime' ? (
        <section className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
          <Card variant="default" padding="lg" animate={false} className="bg-surface-2">
            <CardHeader
              title="Local Models"
              action={
                <div className="flex flex-wrap items-center gap-3">
                  <StatusDot
                    status={resolveRuntimeDotStatus(runtimeReady, ollamaStatus, loading)}
                    label={resolveRuntimeStatusLabel(runtimeReady, ollamaStatus, loading)}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    loading={loading}
                    onClick={() => void onRefresh()}
                    disabled={busy}
                  >
                    Refresh
                  </Button>
                </div>
              }
            />

            <CardSection label="Runtime mode" className="mt-5">
              <Select
                label="Agent runtime"
                value={agentMode}
                onChange={(e) => void onSaveAgentMode(e.target.value as AgentMode)}
                disabled={busy || loading}
                options={[
                  { value: 'auto', label: 'Auto (bridge if available, else Ollama)' },
                  { value: 'ollama', label: 'Ollama only' },
                  { value: 'bridge', label: 'Runtime bridge (external)' },
                ]}
              />
              {agentMode === 'bridge' && !snapshot.runtime.runtimeBridgeReady ? (
                <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                  Runtime bridge is not available. Install the CLI or switch to Ollama.
                </div>
              ) : null}
              {workspaceSecurity?.enabled ? (
                <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                  Workspace encryption disables the plaintext runtime-workspace mirror, so direct local/cloud execution stays on and bridge execution is bypassed.
                </div>
              ) : null}
            </CardSection>

            <CardSection label="Scheduling timezone">
              <Select
                label="Task schedule timezone"
                value={snapshot.profile?.timezone ?? ''}
                onChange={(e) => void onSaveScheduleTimezone(e.target.value)}
                disabled={busy || loading || !snapshot.profile}
                options={[
                  { value: '', label: 'System default' },
                  { value: 'UTC', label: 'UTC' },
                  { value: 'America/New_York', label: 'Eastern (America/New_York)' },
                  { value: 'America/Chicago', label: 'Central (America/Chicago)' },
                  { value: 'America/Denver', label: 'Mountain (America/Denver)' },
                  { value: 'America/Los_Angeles', label: 'Pacific (America/Los_Angeles)' },
                  { value: 'Europe/London', label: 'London (Europe/London)' },
                  { value: 'Europe/Paris', label: 'Paris (Europe/Paris)' },
                  { value: 'Europe/Berlin', label: 'Berlin (Europe/Berlin)' },
                  { value: 'Asia/Tokyo', label: 'Tokyo (Asia/Tokyo)' },
                  { value: 'Asia/Kolkata', label: 'India (Asia/Kolkata)' },
                ]}
              />
            </CardSection>

            <CardSection label="Overview">
              <div className="grid gap-3 md:grid-cols-4">
                <InfoCard label="Ollama" value={ollamaStatus?.running ? 'Running' : 'Not running'} />
                <InfoCard label="Bridge" value={snapshot.runtime.runtimeBridgeReady ? 'Ready' : 'Not available'} />
                <InfoCard label="Installed" value={`${installedModelCount}`} />
                <InfoCard label="Shown" value={`${ollamaStatus?.models.length ?? 0}`} />
              </div>
            </CardSection>

            <Divider className="my-5" />

            <CardSection label="Model Status">
              <motion.div
                className="space-y-3"
                variants={listVariants}
                initial="hidden"
                animate="show"
              >
                {ollamaStatus?.models.length
                  ? ollamaStatus.models.map((model) => (
                      <motion.div key={model.id} variants={itemVariants}>
                        <Card variant="default" padding="md" animate={false} className="bg-surface-3">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-white">{model.label}</div>
                              <div className="mt-1 truncate text-[11px] font-semibold uppercase tracking-[0.04em] text-white/40">
                                {model.id}
                              </div>
                            </div>
                            <Badge variant={resolveModelVariant(model)}>
                              {model.status.replaceAll('_', ' ')}
                            </Badge>
                          </div>

                          {model.phase || model.progress !== undefined || model.lastError ? (
                            <div className="mt-4 space-y-2">
                              {model.phase ? (
                                <div className="text-xs text-white/55">{model.phase}</div>
                              ) : null}
                              {model.progress !== undefined ? (
                                <div className="h-2 overflow-hidden rounded-full bg-surface-1">
                                  <div
                                    className="h-full rounded-full bg-brand transition-all"
                                    style={{
                                      width: `${Math.max(0, Math.min(100, model.progress))}%`,
                                    }}
                                  />
                                </div>
                              ) : null}
                              {model.lastError ? (
                                <div className="rounded-2xl border border-red-400/20 bg-red-400/10 px-3 py-2 text-xs text-red-100">
                                  {model.lastError}
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                        </Card>
                      </motion.div>
                    ))
                  : models.map((model) => (
                      <motion.div key={model.id} variants={itemVariants}>
                        <Card variant="default" padding="md" animate={false} className="bg-surface-3">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-white">{model.label}</div>
                              <div className="mt-1 truncate text-[11px] font-semibold uppercase tracking-[0.04em] text-white/40">
                                {model.id}
                              </div>
                            </div>
                            <Badge variant={model.installed ? 'success' : 'default'}>
                              {model.installed ? 'installed' : 'preset'}
                            </Badge>
                          </div>
                        </Card>
                      </motion.div>
                    ))}
              </motion.div>
            </CardSection>
          </Card>

          <Card variant="default" padding="lg" animate={false} className="bg-surface-2">
            <CardHeader
              title="Starter Models"
              icon={<Download size={16} className="text-brand-light" />}
            />


            <CardSection label="Presets" className="mt-5">
              <motion.div
                className="space-y-3"
                variants={listVariants}
                initial="hidden"
                animate="show"
              >
                {models.map((model) => (
                  <motion.div key={model.id} variants={itemVariants}>
                    <Card variant="default" padding="md" animate={false} className="bg-surface-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-white">{model.label}</div>
                          <div className="mt-1 truncate text-[11px] font-semibold uppercase tracking-[0.04em] text-white/40">
                            {model.id}
                          </div>
                        </div>
                        <Badge variant={model.installed ? 'success' : 'default'}>
                          {model.installed ? 'installed' : 'preset'}
                        </Badge>
                      </div>
                    </Card>
                  </motion.div>
                ))}
              </motion.div>
            </CardSection>

            <Button
              type="button"
              variant="brand"
              size="lg"
              fullWidth
              loading={busy}
              icon={<Download size={15} />}
              className="mt-5"
              onClick={() => void onInstallDefaults()}
            >
              {busy ? 'Installing...' : 'Install Starter Models'}
            </Button>

            <Divider className="my-5" />

            <CardSection label="Workspace Encryption">
              <Card variant="default" padding="md" animate={false} className="bg-surface-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-white">
                      {workspaceSecurity?.enabled ? 'Enabled' : 'Disabled'}
                    </div>
                    <div className="mt-1 text-xs leading-6 text-white/55">
                      AES-256-GCM with Argon2id. Lost password means lost data.
                    </div>
                  </div>
                  <Badge variant={workspaceSecurity?.enabled ? 'warning' : 'default'}>
                    {workspaceSecurity?.enabled ? 'Locked on startup' : 'Off'}
                  </Badge>
                </div>

                {workspaceSecurity?.enabled ? (
                  <form onSubmit={handleDisableEncryption} className="mt-4 space-y-3">
                    <Input
                      type="password"
                      autoComplete="off"
                      label="Current Password"
                      value={disablePassword}
                      onChange={(event) => setDisablePassword(event.target.value)}
                      className="bg-surface-1"
                    />
                    <Button type="submit" variant="danger" size="md" fullWidth loading={loading || busy}>
                      Disable Encryption
                    </Button>
                  </form>
                ) : (
                  <form onSubmit={handleEnableEncryption} className="mt-4 space-y-3">
                    <Input
                      type="password"
                      autoComplete="new-password"
                      label="New Password"
                      value={encryptionPassword}
                      onChange={(event) => setEncryptionPassword(event.target.value)}
                      className="bg-surface-1"
                    />
                    <Input
                      type="password"
                      autoComplete="new-password"
                      label="Confirm Password"
                      value={encryptionConfirm}
                      onChange={(event) => setEncryptionConfirm(event.target.value)}
                      className="bg-surface-1"
                    />
                    <Button type="submit" variant="brand" size="md" fullWidth loading={loading || busy}>
                      Enable Encryption
                    </Button>
                  </form>
                )}

                {securityError ? (
                  <div className="mt-3 rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-100">
                    {securityError}
                  </div>
                ) : null}
              </Card>
            </CardSection>
          </Card>
        </section>
      ) : null}

      {activeSection === 'providers' ? (
        <section className="grid gap-5 xl:grid-cols-[1fr_1fr]">
          <Card variant="default" padding="lg" animate={false} className="bg-surface-2">
            <CardHeader title="Accounts" />
            <Divider className="my-5" />

            {providerProfiles.length === 0 ? (
              <Card variant="default" padding="lg" animate={false} className="bg-surface-3">
                <div className="text-center text-sm leading-7 text-white/48">No accounts yet.</div>
              </Card>
            ) : (
              <motion.div
                className="space-y-4"
                variants={listVariants}
                initial="hidden"
                animate="show"
              >
                {providerProfiles.map((profile) => (
                  <motion.div key={profile.id} variants={itemVariants}>
                    <Card variant="default" padding="md" animate={false} className="bg-surface-3">
                      <CardHeader
                        title={profile.label}
                        subtitle={profile.provider}
                        action={
                          <div className="flex flex-wrap items-center gap-2">
                            {providerSelections[profile.provider as RemoteProviderId] === profile.id ? (
                              <Badge variant="success">Active</Badge>
                            ) : null}
                            {profile.isDefault ? <Badge variant="default">Default</Badge> : null}
                          </div>
                        }
                      />


                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        <InfoCard label="Key" value={profile.keyRef ? 'Saved' : 'Not added'} />
                        <InfoCard label="Token" value={profile.tokenRef ? 'Saved' : 'Not added'} />
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          disabled={busy}
                          onClick={() =>
                            void onSetProviderSelection(profile.provider as RemoteProviderId, profile.id)
                          }
                        >
                          Make Active
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          icon={<FlaskConical size={12} />}
                          disabled={busy}
                          onClick={() => void onTestProfile(profile, false)}
                        >
                          Check Keys
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          disabled={busy}
                          onClick={() => void onTestProfile(profile, true)}
                        >
                          Test Connection
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="danger"
                          icon={<Trash2 size={12} />}
                          disabled={busy}
                          onClick={() => void onDeleteProfile(profile)}
                        >
                          Delete
                        </Button>
                      </div>
                    </Card>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </Card>

          <Card variant="default" padding="lg" animate={false} className="bg-surface-2">
            <CardHeader title="Add Account" icon={<KeyRound size={16} className="text-brand-light" />} />

            <form onSubmit={handleSaveProfile} className="mt-5 space-y-4">
              <Select
                ref={providerRef}
                label="Provider"
                defaultValue="openai"
                options={providerOptions}
                className="bg-surface-1"
              />

              <Input
                ref={labelRef}
                label="Name"
                placeholder="Founder OpenAI"
                className="bg-surface-1"
              />

              <label className="block space-y-1.5">
                <span className="block text-[11px] font-semibold uppercase tracking-[0.04em] text-white/50">
                  Notes
                </span>
                <textarea
                  ref={descriptionRef}
                  className="min-h-[112px] w-full rounded-xl border border-white/[0.10] bg-surface-1 px-3.5 py-2.5 text-[13px] leading-relaxed text-white/90 outline-none transition-all duration-150 placeholder:text-white/25 hover:border-white/[0.16] focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20"
                  placeholder="Optional"
                />
              </label>

              <Input
                ref={apiKeyRef}
                type="password"
                autoComplete="off"
                label="API Key"
                placeholder="API key"
                className="bg-surface-1"
              />

              <Input
                ref={tokenRef}
                type="password"
                autoComplete="off"
                label="Access Token"
                placeholder="Token"
                className="bg-surface-1"
              />

              <label className="flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-surface-3 px-4 py-4 text-sm text-white/70">
                <input
                  ref={defaultRef}
                  type="checkbox"
                  className="h-4 w-4 rounded border-white/20 bg-transparent"
                />
                Make this the default for this service
              </label>

              {formError ? (
                <div className="rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-100">
                  {formError}
                </div>
              ) : null}

              <Button
                type="submit"
                variant="brand"
                size="lg"
                fullWidth
                loading={busy}
                icon={<KeyRound size={15} />}
              >
                {busy ? 'Saving...' : 'Save Account'}
              </Button>
            </form>
          </Card>
        </section>
      ) : null}

      {activeSection === 'agents' ? (
        <SpectrumView
          snapshot={snapshot}
          busy={busy}
          onCreateAgentTask={onCreateAgentTask}
          onUpsertGroup={onUpsertGroup}
          onDeleteGroup={onDeleteGroup}
          onOpenChat={onOpenChat}
        />
      ) : null}

      {activeSection === 'prism' ? (
        <Card variant="default" padding="lg" animate={false} className="bg-surface-2">
          <CardHeader
            title="Prism"
            action={
              <Badge variant={prismOverride ? 'brand' : 'default'}>
                {prismOverride ? `${prismOverride.provider} / ${prismOverride.modelId}` : 'Automatic'}
              </Badge>
            }
          />

          <Divider className="my-5" />

          <CardSection label="Runtime override">
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const modelId = prismOverrideModelId.trim();
                if (!modelId) return;
                await onSavePrismOverride({ provider: prismOverrideProvider, modelId });
              }}
              className="space-y-4"
            >
              <Select
                label="Provider"
                value={prismOverrideProvider}
                onChange={(e) => {
                  const nextProvider = e.target.value as ProviderId;
                  setPrismOverrideProvider(nextProvider);

                  const installedForProvider = models.filter((m) => m.provider === nextProvider && m.installed);
                  const isCurrentStillValid = prismOverrideModelId
                    ? installedForProvider.some((m) => m.id === prismOverrideModelId)
                    : false;
                  if (isCurrentStillValid) return;

                  const nextModelId = nextProvider === prismOverride?.provider ? prismOverride?.modelId : installedForProvider[0]?.id;
                  setPrismOverrideModelId(nextModelId ?? '');
                }}
                disabled={busy || loading}
                options={[
                  { value: 'openai', label: 'OpenAI' },
                  { value: 'anthropic', label: 'Anthropic' },
                  { value: 'google', label: 'Google' },
                  { value: 'ollama', label: 'Ollama' },
                ]}
              />

              {(() => {
                const installedForProvider = models.filter(
                  (m) => m.provider === prismOverrideProvider && m.installed,
                );
                const options: Array<{ value: string; label: string; disabled?: boolean }> = installedForProvider.map((m) => ({
                  value: m.id,
                  label: `${m.label} / ${m.id}`,
                  disabled: false,
                }));

                // Keep the currently selected model visible even if it's not installed.
                if (prismOverrideModelId && !options.some((opt) => opt.value === prismOverrideModelId)) {
                  options.unshift({ value: prismOverrideModelId, label: `${prismOverrideModelId} (not installed)`, disabled: true });
                }

                const resolvedOptions =
                  options.length > 0
                    ? options
                    : [{ value: '', label: 'No installed models', disabled: true }];

                if (prismOverrideProvider === 'ollama') {
                  return (
                    <Select
                      label="Local Model"
                      value={prismOverrideModelId}
                      onChange={(e) => setPrismOverrideModelId(e.target.value)}
                      disabled={busy || loading}
                      options={resolvedOptions}
                      hint="Shows installed local Ollama models."
                    />
                  );
                }

                return (
                  <Select
                    label="Model"
                    value={prismOverrideModelId}
                    onChange={(e) => setPrismOverrideModelId(e.target.value)}
                    disabled={busy || loading}
                    options={resolvedOptions}
                  />
                );
              })()}

              <div className="flex flex-wrap gap-2">
                <Button
                  type="submit"
                  variant="brand"
                  size="md"
                  loading={busy || loading}
                  disabled={!prismOverrideModelId.trim() || busy || loading}
                  className="flex-1"
                >
                  Save
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  disabled={busy || loading || prismOverride === null}
                  onClick={() => void onSavePrismOverride(null)}
                >
                  Reset to default
                </Button>
              </div>
            </form>

            {prismOverrideProvider === 'ollama' && installedOllamaModels.length === 0 ? (
              <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                No local Ollama models installed. Install a model under the Local section first.
              </div>
            ) : null}
          </CardSection>
        </Card>
      ) : null}
    </div>
  );
}

const REMOTE_PROVIDER_LABELS: Array<{ id: RemoteProviderId; label: string }> = [
  { id: 'openai', label: 'OpenAI' },
  { id: 'anthropic', label: 'Anthropic' },
  { id: 'google', label: 'Google' },
];

function resolveRuntimeDotStatus(
  runtimeReady: boolean,
  ollamaStatus: OllamaRuntimeStatus | null,
  loading: boolean,
): React.ComponentProps<typeof StatusDot>['status'] {
  if (loading) return 'busy';
  if (!runtimeReady) return 'error';
  if (ollamaStatus?.running) return 'online';
  return 'offline';
}

function resolveRuntimeStatusLabel(
  runtimeReady: boolean,
  ollamaStatus: OllamaRuntimeStatus | null,
  loading: boolean,
) {
  if (loading) return 'Checking runtime';
  if (!runtimeReady) return 'Runtime unavailable';
  if (ollamaStatus?.running) return 'Ollama running';
  return 'Ollama stopped';
}

function resolveModelVariant(
  model: { status?: string; installed?: boolean },
): NonNullable<React.ComponentProps<typeof Badge>['variant']> {
  if ('status' in model) {
    if (model.status === 'installed') return 'success';
    if (model.status === 'installing') return 'warning';
    if (model.status === 'error') return 'error';
  }

  return model.installed ? 'success' : 'default';
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <Card variant="default" padding="md" animate={false} className="bg-surface-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-white/40">
        {label}
      </div>
      <div className="mt-2 text-sm leading-6 text-white/72">{value}</div>
    </Card>
  );
}
