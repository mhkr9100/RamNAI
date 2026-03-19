import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Download, FlaskConical, KeyRound, Sparkles, Trash2 } from 'lucide-react';
import type {
  OllamaRuntimeStatus,
  PrismProviderOverrideSettings,
  ProviderAuthProfile,
  ProviderId,
  ProviderModelPreset,
} from '@supreme/shared';
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

type SettingsSection = 'runtime' | 'providers' | 'prism';
type RemoteProviderId = Exclude<ProviderId, 'ollama'>;

interface SettingsViewProps {
  activeSection: SettingsSection;
  onSelectSection: (section: SettingsSection) => void;
  runtimeReady: boolean;
  providerProfiles: ProviderAuthProfile[];
  providerSelections: Record<RemoteProviderId, string | null>;
  prismOverride: PrismProviderOverrideSettings | null;
  ollamaStatus: OllamaRuntimeStatus | null;
  models: ProviderModelPreset[];
  busy: boolean;
  loading: boolean;
  onRefresh: () => Promise<void>;
  onInstallDefaults: () => Promise<void>;
  onSaveProfile: (input: {
    id: string;
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
}

const sections: Array<{ id: SettingsSection; label: string }> = [
  { id: 'runtime', label: 'Local' },
  { id: 'providers', label: 'Accounts' },
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
  ollamaStatus,
  models,
  busy,
  loading,
  onRefresh,
  onInstallDefaults,
  onSaveProfile,
  onDeleteProfile,
  onTestProfile,
  onSetProviderSelection,
  onSavePrismOverride,
}: SettingsViewProps) {
  const providerRef = useRef<HTMLSelectElement | null>(null);
  const labelRef = useRef<HTMLInputElement | null>(null);
  const descriptionRef = useRef<HTMLTextAreaElement | null>(null);
  const apiKeyRef = useRef<HTMLInputElement | null>(null);
  const tokenRef = useRef<HTMLInputElement | null>(null);
  const defaultRef = useRef<HTMLInputElement | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [overrideProvider, setOverrideProvider] = useState<ProviderId>('ollama');
  const [overrideModelId, setOverrideModelId] = useState('');

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

  const overrideProviderOptions = useMemo(
    () => [{ value: 'ollama', label: 'Ollama' }, ...providerOptions],
    [providerOptions],
  );

  const localModelOptions = useMemo(
    () =>
      installedModels.length === 0
        ? [{ value: '', label: 'No installed local models', disabled: true }]
        : installedModels.map((model) => ({
            value: model.id,
            label: `${model.label} / ${model.id}`,
          })),
    [installedModels],
  );

  const activeProviderSummary = useMemo(
    () =>
      REMOTE_PROVIDER_LABELS.map(
        (provider) => `${provider.label}: ${providerSelections[provider.id] ?? 'none'}`,
      ).join(' | '),
    [providerSelections],
  );

  useEffect(() => {
    if (prismOverride) {
      setOverrideProvider(prismOverride.provider);
      setOverrideModelId(prismOverride.modelId);
      return;
    }

    setOverrideProvider('ollama');
    setOverrideModelId(installedModels[0]?.id ?? '');
  }, [installedModels, prismOverride]);

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
    const id = `${provider}-${slugify(label)}`;

    await onSaveProfile({
      id,
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

  const handleSavePrismOverride = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const modelId = overrideModelId.trim();
    if (!modelId) {
      setFormError('Prism override needs a model id.');
      return;
    }

    setFormError(null);
    await onSavePrismOverride({
      provider: overrideProvider,
      modelId,
    });
  };

  return (
    <div className="space-y-5">
      <Card variant="elevated" padding="lg" animate={false} className="bg-surface-2">
        <CardHeader
          title="Local App"
          subtitle="Manage local runtime models, connected provider accounts, and Prism overrides."
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
              subtitle="Current Ollama runtime state and the models available to the app."
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

            <CardSection label="Overview" className="mt-5">
              <div className="grid gap-3 md:grid-cols-3">
                <InfoCard label="App" value={ollamaStatus?.running ? 'Running' : 'Not running'} />
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
              subtitle="Install the default local stack Supreme Raman AI expects."
              icon={<Download size={16} className="text-brand-light" />}
            />

            <CardSection label="Recommended" className="mt-5">
              <div className="rounded-2xl border border-white/[0.08] bg-surface-3 p-4 text-sm leading-7 text-white/62">
                Install the three local models this app expects first.
              </div>
            </CardSection>

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
          </Card>
        </section>
      ) : null}

      {activeSection === 'providers' ? (
        <section className="grid gap-5 xl:grid-cols-[1fr_1fr]">
          <Card variant="default" padding="lg" animate={false} className="bg-surface-2">
            <CardHeader
              title="Connected Accounts"
              subtitle="Review saved remote credentials and choose which profile is active."
            />
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

                      <div className="mt-3 text-sm leading-6 text-white/60">
                        {profile.description || 'No notes.'}
                      </div>

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
            <CardHeader
              title="Add Account"
              subtitle="Save a remote provider profile for OpenAI, Anthropic, or Google."
              icon={<KeyRound size={16} className="text-brand-light" />}
            />

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
                  className="min-h-[112px] w-full rounded-xl border border-white/[0.10] bg-surface-1 px-3.5 py-2.5 text-[13px] leading-relaxed text-white/90 outline-none transition-all duration-150 placeholder:text-white/25 hover:border-white/[0.16] focus:border-[#7c5cfc]/50 focus:ring-2 focus:ring-[#7c5cfc]/20"
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

      {activeSection === 'prism' ? (
        <section className="grid gap-5 xl:grid-cols-[1fr_1fr]">
          <Card variant="default" padding="lg" animate={false} className="bg-surface-2">
            <CardHeader
              title="Prism Routing"
              subtitle="See the current override and which provider profiles are selected."
              icon={<Sparkles size={16} className="text-brand-light" />}
            />

            <CardSection label="Overview" className="mt-5">
              <div className="space-y-3">
                <InfoCard
                  label="Current"
                  value={prismOverride ? `${prismOverride.provider} / ${prismOverride.modelId}` : 'Automatic'}
                />
                <InfoCard
                  label="Accounts"
                  value={providerProfiles.length ? 'Available' : 'None'}
                />
                <InfoCard label="Active" value={activeProviderSummary} />
              </div>
            </CardSection>
          </Card>

          <Card variant="default" padding="lg" animate={false} className="bg-surface-2">
            <CardHeader
              title="Prism Model"
              subtitle="Pin Prism to one provider and model, or keep it on automatic routing."
              icon={<Sparkles size={16} className="text-brand-light" />}
            />

            <form onSubmit={handleSavePrismOverride} className="mt-5 space-y-4">
              <CardSection label="Guidance">
                <div className="rounded-2xl border border-white/[0.08] bg-surface-3 p-4 text-sm leading-7 text-white/62">
                  Leave this on automatic unless you want Prism to stay on one model.
                </div>
              </CardSection>

              <Select
                label="Provider"
                value={overrideProvider}
                onChange={(event) => {
                  const provider = event.target.value as ProviderId;
                  const firstInstalledModel = installedModels[0];
                  setOverrideProvider(provider);
                  if (provider === 'ollama' && firstInstalledModel) {
                    setOverrideModelId((current) => current || firstInstalledModel.id);
                  }
                }}
                options={overrideProviderOptions}
                className="bg-surface-1"
              />

              {overrideProvider === 'ollama' ? (
                <Select
                  label="Local Model"
                  value={overrideModelId}
                  onChange={(event) => setOverrideModelId(event.target.value)}
                  options={localModelOptions}
                  className="bg-surface-1"
                />
              ) : (
                <Input
                  label="Model ID"
                  value={overrideModelId}
                  onChange={(event) => setOverrideModelId(event.target.value)}
                  placeholder={
                    overrideProvider === 'openai'
                      ? 'gpt-5.4-mini'
                      : overrideProvider === 'anthropic'
                        ? 'claude-sonnet-4-5'
                        : 'gemini-2.5-pro'
                  }
                  className="bg-surface-1"
                />
              )}

              {formError ? (
                <div className="rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-100">
                  {formError}
                </div>
              ) : null}

              <div className="grid gap-3 md:grid-cols-2">
                <Button
                  type="submit"
                  variant="brand"
                  size="lg"
                  loading={busy}
                  icon={<Sparkles size={15} />}
                >
                  Save
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="lg"
                  disabled={busy}
                  onClick={() => void onSavePrismOverride(null)}
                >
                  Use Automatic
                </Button>
              </div>
            </form>
          </Card>
        </section>
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

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
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
