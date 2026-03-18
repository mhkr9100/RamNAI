import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, LoaderCircle } from 'lucide-react';
import { ChatsWorkspace, ChatDraftSeed, ChatTarget } from './components/ChatsWorkspace';
import { LocalProfileScreen } from './components/LocalProfileScreen';
import { Sidebar, ViewId } from './components/Sidebar';
import { PrismWorkspace } from './components/PrismWorkspace';
import { SettingsView } from './components/SettingsView';
import { SpectrumView } from './components/SpectrumView';
import { UserMapPanel } from './components/UserMapPanel';
import { WorkView } from './components/WorkView';
import { AgentChatInput, getDesktopApi, GroupChatInput, TaskCreateInput, WorkspaceSnapshot } from './lib/electron';
import type {
  OllamaRuntimeStatus,
  PrismMode,
  PrismProviderOverrideSettings,
  ProviderAuthProfile,
  ProviderId,
  UserMapState,
  WorkItem
} from '@supreme/shared';

interface PrismMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  mode?: PrismMode | 'work';
}

const REMOTE_PROVIDERS = ['openai', 'anthropic', 'google'] as const;
type RemoteProviderId = typeof REMOTE_PROVIDERS[number];

export default function App() {
  const api = useMemo(() => {
    try {
      return getDesktopApi();
    } catch {
      return null;
    }
  }, []);
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot | null>(null);
  const [activeView, setActiveView] = useState<ViewId>('prism');
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [prismMessages, setPrismMessages] = useState<PrismMessage[]>([]);
  const [selectedChatTarget, setSelectedChatTarget] = useState<ChatTarget | null>(null);
  const [chatDraftSeed, setChatDraftSeed] = useState<ChatDraftSeed | null>(null);
  const [selectedSettingsSection, setSelectedSettingsSection] = useState<'runtime' | 'providers' | 'prism'>('runtime');
  const [providerProfiles, setProviderProfiles] = useState<ProviderAuthProfile[]>([]);
  const [providerSelections, setProviderSelections] = useState<Record<RemoteProviderId, string | null>>({
    openai: null,
    anthropic: null,
    google: null
  });
  const [prismOverride, setPrismOverride] = useState<PrismProviderOverrideSettings | null>(null);
  const [ollamaStatus, setOllamaStatus] = useState<OllamaRuntimeStatus | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(false);

  const refreshSnapshot = useCallback(async () => {
    if (!api) {
      throw new Error('Supreme Raman AI desktop bridge is unavailable.');
    }
    const next = await api.workspace.getSnapshot();
    setSnapshot(next);
    return next;
  }, [api]);

  const refreshSettings = useCallback(async () => {
    if (!api) {
      throw new Error('Supreme Raman AI desktop bridge is unavailable.');
    }
    setSettingsLoading(true);
    try {
      const [profiles, runtimeStatus, openaiSelection, anthropicSelection, googleSelection, override] = await Promise.all([
        api.settings.listProviderProfiles(),
        api.settings.getOllamaStatus(),
        api.settings.getProviderSelection('openai'),
        api.settings.getProviderSelection('anthropic'),
        api.settings.getProviderSelection('google'),
        api.settings.getPrismOverride()
      ]);
      setProviderProfiles(profiles);
      setOllamaStatus(runtimeStatus);
      setProviderSelections({
        openai: openaiSelection?.profileId ?? null,
        anthropic: anthropicSelection?.profileId ?? null,
        google: googleSelection?.profileId ?? null
      });
      setPrismOverride(override);
    } finally {
      setSettingsLoading(false);
    }
  }, [api]);

  useEffect(() => {
    let mounted = true;
    if (!api) {
      setError('Desktop bridge unavailable. Launch Supreme Raman AI through Electron with `npm run desktop:dev` instead of opening the Vite URL directly in a browser.');
      setLoading(false);
      return () => {
        mounted = false;
      };
    }
    (async () => {
      try {
        const [next] = await Promise.all([
          api.workspace.getSnapshot(),
          refreshSettings()
        ]);
        if (!mounted) return;
        setSnapshot(next);
      } catch (nextError) {
        if (!mounted) return;
        setError(nextError instanceof Error ? nextError.message : String(nextError));
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [api, refreshSettings]);

  useEffect(() => {
    if (!snapshot?.profile) return;

    const interval = window.setInterval(() => {
      void refreshSnapshot().catch(() => {
        // Keep the UI responsive even if a background poll fails once.
      });
    }, 3000);

    return () => {
      window.clearInterval(interval);
    };
  }, [refreshSnapshot, snapshot?.profile]);

  const handleSaveProfile = async (profile: { name: string; email: string }) => {
    if (!api) {
      throw new Error('Desktop bridge unavailable.');
    }
    setSavingProfile(true);
    setError(null);
    try {
      await api.profile.save(profile);
      await refreshSnapshot();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
      throw nextError;
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePrismSend = async (mode: PrismMode, message: string) => {
    if (!api || !snapshot) return;
    const userMessage: PrismMessage = { id: crypto.randomUUID(), role: 'user', text: message, mode };
    setPrismMessages((current) => [...current, userMessage]);
    setBusy(true);
    setError(null);

    try {
      const reply = await api.prism.sendMessage({
        mode,
        message,
        userMap: snapshot.userMap,
        existingAgents: snapshot.agents,
        existingGroups: snapshot.groups
      });
      setPrismMessages((current) => [...current, { id: reply.id, role: 'assistant', text: reply.text, mode }]);
      await refreshSnapshot();
      if (reply.createdAgent) {
        setSelectedChatTarget({ type: 'agent', id: reply.createdAgent.id });
        setNotice(`Created ${reply.createdAgent.name} and opened its chat.`);
        setActiveView('chats');
      }
    } catch (nextError) {
      const messageText = nextError instanceof Error ? nextError.message : String(nextError);
      setPrismMessages((current) => [...current, { id: crypto.randomUUID(), role: 'system', text: messageText, mode }]);
      setError(messageText);
    } finally {
      setBusy(false);
    }
  };

  const handleTaskCreate = async (input: TaskCreateInput) => {
    if (!api) {
      throw new Error('Desktop bridge unavailable.');
    }
    setBusy(true);
    setError(null);
    try {
      await api.tasks.create(input);
      await refreshSnapshot();
      setNotice(`Scheduled ${input.title}.`);
      setActiveView('work');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
      throw nextError;
    } finally {
      setBusy(false);
    }
  };

  const handleUpsertGroup = async (group: {
    id?: string;
    name: string;
    description?: string;
    memberAgentIds: string[];
    routingMode: 'auto' | 'manual';
    autoRouteThreshold: number;
    defaultResponderAgentId?: string;
  }) => {
    if (!api) {
      throw new Error('Desktop bridge unavailable.');
    }
    setBusy(true);
    setError(null);
    try {
      const payload = {
        id: group.id ?? crypto.randomUUID(),
        name: group.name,
        memberAgentIds: group.memberAgentIds,
        routingMode: group.routingMode,
        autoRouteThreshold: group.autoRouteThreshold,
        ...(group.defaultResponderAgentId ? { defaultResponderAgentId: group.defaultResponderAgentId } : {})
      } as const;
      await api.groups.upsert(group.description ? { ...payload, description: group.description } : payload);
      await refreshSnapshot();
      setNotice(`Saved group ${group.name}.`);
    } catch (nextError) {
      const messageText = nextError instanceof Error ? nextError.message : String(nextError);
      setError(messageText);
      throw nextError;
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    if (!api) {
      throw new Error('Desktop bridge unavailable.');
    }
    setBusy(true);
    setError(null);
    try {
      await api.groups.delete(groupId);
      await refreshSnapshot();
      setNotice('Group deleted.');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setBusy(false);
    }
  };

  const handleSendAgentMessage = async (input: AgentChatInput) => {
    if (!api) {
      throw new Error('Desktop bridge unavailable.');
    }
    setBusy(true);
    setError(null);
    try {
      await api.chat.sendAgentMessage(input);
      await refreshSnapshot();
    } catch (nextError) {
      const messageText = nextError instanceof Error ? nextError.message : String(nextError);
      setError(messageText);
      throw nextError;
    } finally {
      setBusy(false);
    }
  };

  const handleSendGroupMessage = async (input: GroupChatInput) => {
    if (!api) {
      throw new Error('Desktop bridge unavailable.');
    }
    setBusy(true);
    setError(null);
    try {
      await api.chat.sendGroupMessage(input);
      await refreshSnapshot();
    } catch (nextError) {
      const messageText = nextError instanceof Error ? nextError.message : String(nextError);
      setError(messageText);
      throw nextError;
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!api) {
      throw new Error('Desktop bridge unavailable.');
    }
    setBusy(true);
    setError(null);
    try {
      await api.tasks.delete(taskId);
      await refreshSnapshot();
      setNotice('Task deleted.');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setBusy(false);
    }
  };

  const handleDuplicateTask = async (taskId: string) => {
    if (!api) {
      throw new Error('Desktop bridge unavailable.');
    }
    setBusy(true);
    setError(null);
    try {
      await api.tasks.duplicate(taskId);
      await refreshSnapshot();
      setNotice('Task duplicated.');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setBusy(false);
    }
  };

  const handleRerunTask = async (taskId: string) => {
    if (!api) {
      throw new Error('Desktop bridge unavailable.');
    }
    setBusy(true);
    setError(null);
    try {
      await api.tasks.rerun(taskId);
      await refreshSnapshot();
      setNotice('Task queued for rerun.');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteWorkItem = async (workItemId: string) => {
    if (!api) {
      throw new Error('Desktop bridge unavailable.');
    }
    setBusy(true);
    setError(null);
    try {
      await api.work.delete(workItemId);
      await refreshSnapshot();
      setNotice('Work item deleted.');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setBusy(false);
    }
  };

  const handleOpenArtifact = async (artifactId: string) => {
    if (!api) {
      throw new Error('Desktop bridge unavailable.');
    }
    setError(null);
    try {
      await api.work.openArtifact(artifactId);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    }
  };

  const handleSendWorkToChat = (item: WorkItem) => {
    if (item.sourceAgentId && snapshot?.agents.some((agent) => agent.id === item.sourceAgentId)) {
      const target: ChatTarget = { type: 'agent', id: item.sourceAgentId };
      setSelectedChatTarget(target);
      setChatDraftSeed({
        target,
        token: crypto.randomUUID(),
        text: `From Work — ${item.title}\n\n${item.summary ?? item.lastError ?? 'No saved body.'}`
      });
      setActiveView('chats');
      setNotice('Loaded the Work result into the chatbot composer.');
      return;
    }

    setPrismMessages((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        role: 'system',
        mode: 'work',
        text: `Injected from Work — ${item.title}\n\n${item.summary ?? item.lastError ?? 'No saved body.'}`
      }
    ]);
    setActiveView('prism');
  };

  const handleDeleteThread = async (threadId: string) => {
    if (!api) {
      throw new Error('Desktop bridge unavailable.');
    }
    setBusy(true);
    setError(null);
    try {
      await api.chat.deleteThread(threadId);
      await refreshSnapshot();
      setNotice('Thread reset.');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setBusy(false);
    }
  };

  const handleOpenChatTarget = useCallback((target: ChatTarget) => {
    setSelectedChatTarget(target);
    setChatDraftSeed(null);
    setActiveView('chats');
  }, []);

  const handleOpenChatDestination = useCallback((target: ChatTarget | 'prism') => {
    if (target === 'prism') {
      setActiveView('prism');
      return;
    }

    setSelectedChatTarget(target);
    setChatDraftSeed(null);
    setActiveView('chats');
  }, []);

  const handleSelectChatTarget = useCallback((target: ChatTarget | null) => {
    setSelectedChatTarget(target);
  }, []);

  const handleSaveProviderProfile = async (input: {
    id: string;
    provider: RemoteProviderId;
    label: string;
    description?: string;
    apiKey?: string;
    token?: string;
    isDefault?: boolean;
  }) => {
    if (!api) {
      throw new Error('Desktop bridge unavailable.');
    }
    setBusy(true);
    setError(null);
    try {
      await api.settings.saveProviderProfile(input);
      await refreshSettings();
      setNotice(`Saved ${input.provider} profile ${input.label}.`);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
      throw nextError;
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteProviderProfile = async (profile: ProviderAuthProfile) => {
    if (!api || profile.provider === 'ollama') {
      throw new Error('Desktop bridge unavailable.');
    }
    setBusy(true);
    setError(null);
    try {
      await api.settings.deleteProviderProfile({
        provider: profile.provider,
        profileId: profile.id
      });
      await refreshSettings();
      setNotice(`Deleted ${profile.label}.`);
    } catch (nextError) {
      const messageText = nextError instanceof Error ? nextError.message : String(nextError);
      setError(messageText);
      throw nextError;
    } finally {
      setBusy(false);
    }
  };

  const handleTestProviderProfile = async (
    profile: ProviderAuthProfile,
    probeWithRuntime = false
  ) => {
    if (!api || profile.provider === 'ollama') {
      throw new Error('Desktop bridge unavailable.');
    }
    setBusy(true);
    setError(null);
    try {
      const result = await api.settings.testProviderProfile({
        provider: profile.provider,
        profileId: profile.id,
        ...(probeWithRuntime ? { probeWithRuntime: true } : {})
      });
      if (result.ok) {
        setNotice(result.message);
      } else {
        setError(result.message);
      }
    } catch (nextError) {
      const messageText = nextError instanceof Error ? nextError.message : String(nextError);
      setError(messageText);
      throw nextError;
    } finally {
      setBusy(false);
    }
  };

  const handleSetProviderSelection = async (provider: RemoteProviderId, profileId: string | null) => {
    if (!api) {
      throw new Error('Desktop bridge unavailable.');
    }
    setBusy(true);
    setError(null);
    try {
      await api.settings.setProviderSelection({ provider, profileId });
      await refreshSettings();
      setNotice(profileId ? `Selected active ${provider} profile.` : `Cleared ${provider} profile selection.`);
    } catch (nextError) {
      const messageText = nextError instanceof Error ? nextError.message : String(nextError);
      setError(messageText);
      throw nextError;
    } finally {
      setBusy(false);
    }
  };

  const handleSavePrismOverride = async (override: PrismProviderOverrideSettings | null) => {
    if (!api) {
      throw new Error('Desktop bridge unavailable.');
    }
    setBusy(true);
    setError(null);
    try {
      await api.settings.savePrismOverride(override);
      await refreshSettings();
      setNotice(override ? 'Saved Prism settings.' : 'Cleared Prism settings.');
    } catch (nextError) {
      const messageText = nextError instanceof Error ? nextError.message : String(nextError);
      setError(messageText);
      throw nextError;
    } finally {
      setBusy(false);
    }
  };

  const handleInstallDefaultModels = async () => {
    if (!api) {
      throw new Error('Desktop bridge unavailable.');
    }
    setBusy(true);
    setError(null);
    try {
      const status = await api.settings.installDefaultModels();
      setOllamaStatus(status);
      await refreshSnapshot();
      setNotice('Requested installation of the default local models.');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setBusy(false);
    }
  };

  const handleSaveUserMap = async (tree: UserMapState) => {
    if (!api) {
      throw new Error('Desktop bridge unavailable.');
    }
    setBusy(true);
    setError(null);
    try {
      await api.userMap.save(tree);
      await refreshSnapshot();
      setNotice('UserMap saved locally.');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
      throw nextError;
    } finally {
      setBusy(false);
    }
  };

  const handleSyncUserMap = async () => {
    if (!api) {
      throw new Error('Desktop bridge unavailable.');
    }
    setBusy(true);
    setError(null);
    try {
      await api.userMap.syncMemories();
      await refreshSnapshot();
      setNotice('UserMap merged with extracted memory facts.');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setBusy(false);
    }
  };

  const handleClearPrismTranscript = () => {
    setPrismMessages([]);
    setNotice('Prism history cleared.');
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#08090a] text-white">
        <div className="inline-flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-sm text-white/70">
          <LoaderCircle className="animate-spin" size={18} />
          Loading RamN AI…
        </div>
      </div>
    );
  }

  if (!api) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#08090a] px-8 text-white">
        <div className="max-w-2xl rounded-[32px] border border-white/10 bg-white/5 p-8 text-center">
          <div className="text-[10px] font-black uppercase tracking-[0.24em] text-white/40">RamN AI</div>
          <div className="mt-4 text-3xl font-semibold">Desktop bridge not detected.</div>
          <p className="mt-4 text-base leading-8 text-white/65">
            This renderer is meant to run inside the Electron desktop shell. If you open the Vite URL directly in a browser, the local desktop APIs will not exist.
          </p>
          <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 px-5 py-4 text-left text-sm leading-7 text-white/72">
            Run:
            <pre className="mt-3 overflow-x-auto text-white"><code>npm run desktop:dev</code></pre>
          </div>
        </div>
      </div>
    );
  }

  if (!snapshot?.profile) {
    return <LocalProfileScreen onSave={handleSaveProfile} isSaving={savingProfile} />;
  }

  return (
    <div className="flex min-h-screen bg-[#08090a] text-white">
      <Sidebar activeView={activeView} onSelect={setActiveView} />
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-[#0e1012]">
        <header className="border-b border-white/6 bg-[#0b0d0f]/95 px-4 backdrop-blur-xl">
          <div className="flex h-full flex-wrap items-center justify-between gap-4">
            <div className="py-3">
              <div className="text-[8px] font-black uppercase tracking-[0.22em] text-white/30">RamN AI</div>
              <div className="mt-1 text-sm font-semibold text-white">
                {activeView === 'prism'
                  ? 'Prism'
                  : activeView === 'chats'
                    ? 'Chats'
                    : activeView === 'usermap'
                      ? 'UserMap'
                      : activeView === 'spectrum'
                        ? 'Spectrum'
                        : activeView === 'work'
                          ? 'Work'
                        : 'Settings'}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-white/50">
              <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[9px] font-black uppercase tracking-[0.16em] text-white/55">
                {snapshot.profile.name}
              </div>
            </div>
          </div>
          {error || notice ? (
            <div className="grid gap-2 border-t border-white/6 py-2 lg:grid-cols-[1fr_auto]">
              {error ? (
                <div className="rounded-xl border border-red-400/20 bg-red-400/10 px-3 py-2.5 text-sm text-red-100">
                  <div className="mb-1 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-red-200"><AlertTriangle size={13} />Error</div>
                  {error}
                </div>
              ) : <div className="hidden lg:block" />}
              {notice ? (
                <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white/72">
                  {notice}
                </div>
              ) : null}
            </div>
          ) : null}
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar">
          <section className="mx-auto min-w-0 w-full max-w-[1360px] px-3 py-3">
            {activeView === 'prism' ? (
              <PrismWorkspace
                snapshot={snapshot}
                messages={prismMessages}
                busy={busy}
                onSend={handlePrismSend}
                onCreateTask={handleTaskCreate}
                onClearTranscript={handleClearPrismTranscript}
              />
            ) : null}
            {activeView === 'chats' ? (
              <ChatsWorkspace
                snapshot={snapshot}
                busy={busy}
                selectedTarget={selectedChatTarget}
                draftSeed={chatDraftSeed}
                onSelectTarget={handleSelectChatTarget}
                onSendAgentMessage={handleSendAgentMessage}
                onSendGroupMessage={handleSendGroupMessage}
                onCreateTask={handleTaskCreate}
                onDeleteThread={handleDeleteThread}
              />
            ) : null}
            {activeView === 'spectrum' ? (
              <SpectrumView
                snapshot={snapshot}
                busy={busy}
                onCreateAgentTask={handleTaskCreate}
                onUpsertGroup={handleUpsertGroup}
                onDeleteGroup={handleDeleteGroup}
                onOpenChat={handleOpenChatTarget}
              />
            ) : null}
            {activeView === 'work' ? (
              <WorkView
                snapshot={snapshot}
                busy={busy}
                onDeleteTask={handleDeleteTask}
                onDuplicateTask={handleDuplicateTask}
                onRerunTask={handleRerunTask}
                onDeleteWorkItem={handleDeleteWorkItem}
                onSendToChat={handleSendWorkToChat}
                onOpenChat={handleOpenChatDestination}
                onOpenArtifact={handleOpenArtifact}
              />
            ) : null}
            {activeView === 'usermap' ? (
              <UserMapPanel
                tree={snapshot.userMap}
                facts={snapshot.memoryFacts}
                busy={busy}
                onSave={handleSaveUserMap}
                onSync={handleSyncUserMap}
              />
            ) : null}
            {activeView === 'settings' ? (
              <SettingsView
                activeSection={selectedSettingsSection}
                onSelectSection={setSelectedSettingsSection}
                runtimeReady={snapshot.runtime.available}
                providerProfiles={providerProfiles}
                providerSelections={providerSelections}
                prismOverride={prismOverride}
                ollamaStatus={ollamaStatus}
                models={snapshot.models}
                busy={busy}
                loading={settingsLoading}
                onRefresh={refreshSettings}
                onInstallDefaults={handleInstallDefaultModels}
                onSaveProfile={handleSaveProviderProfile}
                onDeleteProfile={handleDeleteProviderProfile}
                onTestProfile={handleTestProviderProfile}
                onSetProviderSelection={handleSetProviderSelection}
                onSavePrismOverride={handleSavePrismOverride}
              />
            ) : null}
          </section>
        </div>
      </main>
    </div>
  );
}
