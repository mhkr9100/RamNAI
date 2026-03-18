import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Download, FlaskConical, KeyRound, LoaderCircle, Sparkles, Trash2, Wrench } from 'lucide-react';
import type {
  OllamaRuntimeStatus,
  PrismProviderOverrideSettings,
  ProviderAuthProfile,
  ProviderId,
  ProviderModelPreset
} from '@supreme/shared';

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

const sections: Array<{ id: SettingsSection; label: string; body: string }> = [
  { id: 'runtime', label: 'Runtime', body: 'Inspect Ollama availability and install the default local models.' },
  { id: 'providers', label: 'Providers', body: 'Store remote provider profiles locally using Raman-compatible auth files.' },
  { id: 'prism', label: 'Prism', body: 'Review how Prism will use local and remote providers in this desktop build.' }
];

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
  onSavePrismOverride
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
    [models]
  );

  const installedModels = useMemo(
    () => models.filter((model) => model.installed),
    [models]
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
      ...(isDefault ? { isDefault: true } : {})
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
      modelId
    });
  };

  return (
    <div className="space-y-8">
      <section className="rounded-[36px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.08),transparent_36%),linear-gradient(135deg,#0f1215,#090b0d)] p-8 shadow-[0_40px_120px_rgba(0,0,0,0.35)]">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[10px] font-black uppercase tracking-[0.22em] text-white/45">
              <Wrench size={14} /> Settings
            </div>
            <h1 className="mt-5 text-4xl font-semibold leading-tight text-white">Desktop runtime controls, provider profiles, and Prism readiness.</h1>
            <p className="mt-4 max-w-2xl text-base leading-8 text-white/60">
              This surface stays local. Provider metadata comes from desktop IPC, remote secrets are stored in local auth files, and the app keeps Ollama as the default execution path.
            </p>
          </div>
          <div className="grid w-full gap-3 sm:w-[340px]">
            {[
              ['Runtime', runtimeReady ? 'Desktop runtime is reachable.' : 'Desktop runtime needs attention.'],
              ['Installed Models', `${installedModelCount} local model${installedModelCount === 1 ? '' : 's'} ready.`],
              ['Remote Profiles', `${providerProfiles.length} saved profile${providerProfiles.length === 1 ? '' : 's'} in local auth storage.`]
            ].map(([title, body]) => (
              <div key={title} className="rounded-3xl border border-white/8 bg-white/5 p-4">
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-white/42">{title}</div>
                <div className="mt-2 text-sm leading-6 text-white/66">{body}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-3 lg:grid-cols-3">
        {sections.map((section) => {
          const active = section.id === activeSection;
          return (
            <button
              key={section.id}
              type="button"
              onClick={() => onSelectSection(section.id)}
              className={`rounded-[28px] border p-5 text-left transition ${active ? 'border-white/20 bg-white text-black shadow-[0_20px_60px_rgba(255,255,255,0.08)]' : 'border-white/10 bg-white/5 text-white hover:border-white/18 hover:bg-white/8'}`}
            >
              <div className="text-[10px] font-black uppercase tracking-[0.22em] opacity-60">{section.label}</div>
              <div className="mt-3 text-xl font-semibold">{section.label}</div>
              <p className="mt-3 text-sm leading-7 opacity-75">{section.body}</p>
            </button>
          );
        })}
      </section>

      {activeSection === 'runtime' ? (
        <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[32px] border border-white/10 bg-white/5 p-6">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.22em] text-white/38">Ollama Runtime</div>
                <div className="mt-2 text-2xl font-semibold text-white">Local model service</div>
              </div>
              <button
                type="button"
                onClick={() => void onRefresh()}
                disabled={busy || loading}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-white/70 transition hover:border-white/20 hover:text-white disabled:opacity-50"
              >
                {loading ? 'Refreshing…' : 'Refresh'}
              </button>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <InfoCard label="Runtime" value={ollamaStatus?.running ? 'Running' : 'Not running'} />
              <InfoCard label="Installed" value={`${installedModelCount}`} />
              <InfoCard label="Tracked Models" value={`${ollamaStatus?.models.length ?? 0}`} />
            </div>
            <div className="mt-5 space-y-3">
              {ollamaStatus?.models.length ? (
                ollamaStatus.models.map((model) => (
                  <div key={model.id} className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-white">{model.label}</div>
                        <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-white/38">{model.id}</div>
                      </div>
                      <div className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${resolveModelTone(model)}`}>
                        {model.status.replaceAll('_', ' ')}
                      </div>
                    </div>
                    {model.phase || model.progress !== undefined || model.lastError ? (
                      <div className="mt-3 space-y-2">
                        {model.phase ? <div className="text-xs text-white/55">{model.phase}</div> : null}
                        {model.progress !== undefined ? (
                          <div className="h-2 overflow-hidden rounded-full bg-white/8">
                            <div
                              className="h-full rounded-full bg-sky-300 transition-all"
                              style={{ width: `${Math.max(0, Math.min(100, model.progress))}%` }}
                            />
                          </div>
                        ) : null}
                        {model.lastError ? (
                          <div className="rounded-xl border border-red-400/20 bg-red-400/10 px-3 py-2 text-xs text-red-100">
                            {model.lastError}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ))
              ) : (
                models.map((model) => (
                  <div key={model.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
                    <div>
                      <div className="text-sm font-semibold text-white">{model.label}</div>
                      <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-white/38">{model.id}</div>
                    </div>
                    <div className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${resolveModelTone(model)}`}>
                      {model.installed ? 'installed' : 'preset'}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
          <div className="rounded-[32px] border border-white/10 bg-white/5 p-6">
            <div className="mb-4 text-[10px] font-black uppercase tracking-[0.22em] text-white/38">First-run install</div>
            <div className="rounded-3xl border border-white/8 bg-black/20 p-5 text-sm leading-7 text-white/62">
              Raman AI manages the runtime locally and can install the three recommended Ollama models into the workspace during setup. No cloud backend is involved here.
            </div>
            <div className="mt-4 space-y-3">
              {models.map((model) => (
                <div key={model.id} className="rounded-2xl border border-white/8 bg-white/5 px-4 py-3">
                  <div className="text-sm font-semibold text-white">{model.label}</div>
                  <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-white/38">{model.id}</div>
                </div>
              ))}
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => void onInstallDefaults()}
              className="mt-5 inline-flex w-full items-center justify-center gap-3 rounded-2xl bg-white px-5 py-4 text-[11px] font-black uppercase tracking-[0.22em] text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? <LoaderCircle size={15} className="animate-spin" /> : <Download size={15} />}
              {busy ? 'Installing…' : 'Install Default Models'}
            </button>
          </div>
        </section>
      ) : null}

      {activeSection === 'providers' ? (
        <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
          <div className="rounded-[32px] border border-white/10 bg-white/5 p-6">
            <div className="mb-5 text-[10px] font-black uppercase tracking-[0.22em] text-white/38">Saved provider profiles</div>
            {providerProfiles.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-white/12 bg-black/20 px-6 py-10 text-center text-sm leading-7 text-white/45">
                No remote provider profiles are saved yet. Add one on the right and Raman AI will keep the secret refs in local auth files, not SQLite.
              </div>
            ) : (
              <div className="space-y-3">
                {providerProfiles.map((profile) => (
                  <div key={profile.id} className="rounded-3xl border border-white/8 bg-black/20 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white/38">{profile.provider}</div>
                        <div className="mt-2 text-lg font-semibold text-white">{profile.label}</div>
                        <div className="mt-2 text-sm leading-7 text-white/58">{profile.description || 'No description saved.'}</div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {providerSelections[profile.provider as RemoteProviderId] === profile.id ? (
                          <div className="rounded-full bg-emerald-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-200">
                            Active
                          </div>
                        ) : null}
                        {profile.isDefault ? (
                          <div className="rounded-full bg-white/8 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-white/70">
                            Default
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <InfoCard label="Key Ref" value={profile.keyRef?.id ?? 'None'} />
                      <InfoCard label="Token Ref" value={profile.tokenRef?.id ?? 'None'} />
                    </div>
                    <div className="mt-4 flex flex-wrap gap-3">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void onSetProviderSelection(profile.provider as RemoteProviderId, profile.id)}
                        className="rounded-2xl border border-white/12 bg-white/5 px-4 py-3 text-[10px] font-black uppercase tracking-[0.18em] text-white/72 transition hover:border-white/20 hover:text-white disabled:opacity-50"
                      >
                        Use Profile
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void onTestProfile(profile, false)}
                        className="inline-flex items-center gap-2 rounded-2xl border border-white/12 bg-white/5 px-4 py-3 text-[10px] font-black uppercase tracking-[0.18em] text-white/72 transition hover:border-white/20 hover:text-white disabled:opacity-50"
                      >
                        <FlaskConical size={12} />
                        Test Refs
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void onTestProfile(profile, true)}
                        className="rounded-2xl border border-white/12 bg-white/5 px-4 py-3 text-[10px] font-black uppercase tracking-[0.18em] text-white/72 transition hover:border-white/20 hover:text-white disabled:opacity-50"
                      >
                        Probe Runtime
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void onDeleteProfile(profile)}
                        className="inline-flex items-center gap-2 rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-[10px] font-black uppercase tracking-[0.18em] text-red-100 transition hover:border-red-300/35 disabled:opacity-50"
                      >
                        <Trash2 size={12} />
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="rounded-[32px] border border-white/10 bg-white/5 p-6">
            <div className="mb-5 flex items-center gap-3 text-[10px] font-black uppercase tracking-[0.22em] text-white/38">
              <KeyRound size={14} />
              Save provider profile
            </div>
            <form onSubmit={handleSaveProfile} className="space-y-4">
              <label className="space-y-2">
                <span className="text-[10px] font-black uppercase tracking-[0.18em] text-white/42">Provider</span>
                <select ref={providerRef} defaultValue="openai" className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-4 text-sm text-white outline-none">
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic</option>
                  <option value="google">Google</option>
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-[10px] font-black uppercase tracking-[0.18em] text-white/42">Profile Label</span>
                <input
                  ref={labelRef}
                  className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-4 text-sm text-white outline-none"
                  placeholder="Founder OpenAI"
                />
              </label>
              <label className="space-y-2">
                <span className="text-[10px] font-black uppercase tracking-[0.18em] text-white/42">Description</span>
                <textarea
                  ref={descriptionRef}
                  className="min-h-[112px] w-full rounded-3xl border border-white/10 bg-black/25 px-4 py-4 text-sm leading-7 text-white outline-none"
                  placeholder="Used for higher-quality remote reasoning when local Ollama is not enough."
                />
              </label>
              <label className="space-y-2">
                <span className="text-[10px] font-black uppercase tracking-[0.18em] text-white/42">API Key</span>
                <input
                  ref={apiKeyRef}
                  type="password"
                  autoComplete="off"
                  className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-4 text-sm text-white outline-none"
                  placeholder="Paste an API key if this provider uses one."
                />
              </label>
              <label className="space-y-2">
                <span className="text-[10px] font-black uppercase tracking-[0.18em] text-white/42">Token</span>
                <input
                  ref={tokenRef}
                  type="password"
                  autoComplete="off"
                  className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-4 text-sm text-white outline-none"
                  placeholder="Optional token if this provider uses bearer auth."
                />
              </label>
              <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-sm text-white/70">
                <input ref={defaultRef} type="checkbox" className="h-4 w-4 rounded border-white/20 bg-transparent" />
                Mark this as the default profile for the selected provider.
              </label>
              {formError ? <div className="rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-100">{formError}</div> : null}
              <button
                type="submit"
                disabled={busy}
                className="inline-flex w-full items-center justify-center gap-3 rounded-2xl bg-white px-5 py-4 text-[11px] font-black uppercase tracking-[0.22em] text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy ? <LoaderCircle size={15} className="animate-spin" /> : <KeyRound size={15} />}
                {busy ? 'Saving…' : 'Save Provider Profile'}
              </button>
            </form>
          </div>
        </section>
      ) : null}

      {activeSection === 'prism' ? (
        <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
          <div className="rounded-[32px] border border-white/10 bg-white/5 p-6">
            <div className="mb-5 text-[10px] font-black uppercase tracking-[0.22em] text-white/38">Prism execution policy</div>
            <div className="space-y-3">
              <InfoCard label="Current default" value={prismOverride ? `${prismOverride.provider} · ${prismOverride.modelId}` : 'Local Ollama first'} />
              <InfoCard label="Remote fallback" value={providerProfiles.length ? 'Profiles are saved locally and can be activated per provider.' : 'No remote profiles saved yet.'} />
              <InfoCard label="Active remote profiles" value={REMOTE_PROVIDER_LABELS.map((provider) => `${provider.label}: ${providerSelections[provider.id] ?? 'none'}`).join(' • ')} />
            </div>
          </div>
          <div className="rounded-[32px] border border-white/10 bg-white/5 p-6">
            <div className="mb-4 flex items-center gap-3 text-[10px] font-black uppercase tracking-[0.22em] text-white/38">
              <Sparkles size={14} />
              Prism override
            </div>
            <form onSubmit={handleSavePrismOverride} className="space-y-4">
              <div className="rounded-3xl border border-white/8 bg-black/20 p-5 text-sm leading-7 text-white/62">
                Leave Prism in local-first mode for the default behavior. Save an override only if you want Prism itself to prefer a fixed provider and model.
              </div>
              <label className="space-y-2">
                <span className="text-[10px] font-black uppercase tracking-[0.18em] text-white/42">Provider</span>
                <select
                  value={overrideProvider}
                  onChange={(event) => {
                    const provider = event.target.value as ProviderId;
                    const firstInstalledModel = installedModels[0];
                    setOverrideProvider(provider);
                    if (provider === 'ollama' && firstInstalledModel) {
                      setOverrideModelId((current) => current || firstInstalledModel.id);
                    }
                  }}
                  className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-4 text-sm text-white outline-none"
                >
                  <option value="ollama">Ollama</option>
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic</option>
                  <option value="google">Google</option>
                </select>
              </label>
              {overrideProvider === 'ollama' ? (
                <label className="space-y-2">
                  <span className="text-[10px] font-black uppercase tracking-[0.18em] text-white/42">Local Model</span>
                  <select
                    value={overrideModelId}
                    onChange={(event) => setOverrideModelId(event.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-4 text-sm text-white outline-none"
                  >
                    {installedModels.length === 0 ? <option value="">No installed local models yet</option> : null}
                    {installedModels.map((model) => (
                      <option key={model.id} value={model.id}>{model.label} · {model.id}</option>
                    ))}
                  </select>
                </label>
              ) : (
                <label className="space-y-2">
                  <span className="text-[10px] font-black uppercase tracking-[0.18em] text-white/42">Remote Model Id</span>
                  <input
                    value={overrideModelId}
                    onChange={(event) => setOverrideModelId(event.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-4 text-sm text-white outline-none"
                    placeholder={overrideProvider === 'openai' ? 'gpt-5.4-mini' : overrideProvider === 'anthropic' ? 'claude-sonnet-4-5' : 'gemini-2.5-pro'}
                  />
                </label>
              )}
              <div className="grid gap-3 md:grid-cols-2">
                <button
                  type="submit"
                  disabled={busy}
                  className="inline-flex items-center justify-center gap-3 rounded-2xl bg-white px-5 py-4 text-[11px] font-black uppercase tracking-[0.22em] text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busy ? <LoaderCircle size={15} className="animate-spin" /> : <Sparkles size={15} />}
                  Save Override
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onSavePrismOverride(null)}
                  className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-[11px] font-black uppercase tracking-[0.22em] text-white/72 transition hover:border-white/20 hover:text-white disabled:opacity-50"
                >
                  Return To Local-First
                </button>
              </div>
            </form>
          </div>
        </section>
      ) : null}
    </div>
  );
}

const REMOTE_PROVIDER_LABELS: Array<{ id: RemoteProviderId; label: string }> = [
  { id: 'openai', label: 'OpenAI' },
  { id: 'anthropic', label: 'Anthropic' },
  { id: 'google', label: 'Google' }
];

function resolveModelTone(model: { status?: string; installed?: boolean }) {
  if ('status' in model) {
    if (model.status === 'installed') return 'bg-emerald-400/10 text-emerald-200';
    if (model.status === 'installing') return 'bg-sky-400/10 text-sky-200';
    if (model.status === 'error') return 'bg-red-400/10 text-red-200';
  }
  return model.installed ? 'bg-emerald-400/10 text-emerald-200' : 'bg-white/8 text-white/45';
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/5 px-4 py-4">
      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white/38">{label}</div>
      <div className="mt-2 text-sm leading-6 text-white/72">{value}</div>
    </div>
  );
}
